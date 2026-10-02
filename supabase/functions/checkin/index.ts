import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
    const brevoSenderEmail = Deno.env.get("BREVO_SENDER_EMAIL") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized user session");

    const { qrSecretToken } = await req.json();

    // 1. Verify Event
    const { data: event, error: eventErr } = await supabaseAdmin
      .from("events")
      .select("event_id, title, venue, sponsor_message")
      .eq("qr_secret_token", qrSecretToken)
      .single();

    if (eventErr || !event) throw new Error("Invalid or unverified Sabha QR Code");

    // 2. Fetch Profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, sponsor_flag")
      .eq("id", user.id)
      .single();

    // 3. Mark Attendance (Idempotent)
    const { error: attError } = await supabaseAdmin
      .from("attendance")
      .insert({
        user_id: user.id,
        event_id: event.event_id,
        is_sponsor_checkin: profile.sponsor_flag,
      });

    const isDuplicate = attError && attError.code === "23505";

    // 4. Send Confirmation / Sponsor Email via Brevo REST API v3
    if (brevoApiKey && !isDuplicate) {
      let emailHtml = `
        <div style="font-family:sans-serif;max-width:550px;margin:auto;border:1px solid #e2e8f0;padding:20px;border-radius:12px;">
          <h2 style="color:#d97706;margin-top:0;">Attendance Confirmed!</h2>
          <p>Namaste <strong>${profile.name}</strong>,</p>
          <p>Your check-in has been successfully registered for <strong>${event.title}</strong> at <strong>${event.venue}</strong>.</p>
      `;

      if (profile.sponsor_flag) {
        emailHtml += `
          <div style="background:#fffbeb;border-left:4px solid #d97706;padding:12px;margin:20px 0;border-radius:4px;">
            <p style="margin:0;font-weight:bold;color:#92400e;">Special Sponsor Recognition</p>
            <p style="margin:4px 0 0 0;font-style:italic;color:#78350f;">"${event.sponsor_message}"</p>
          </div>
        `;
      }

      emailHtml += `
          <p style="font-size:12px;color:#94a3b8;margin-top:24px;">Dynamic Sabha Assembly System</p>
        </div>
      `;

      await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { email: brevoSenderEmail, name: "Sabha Assembly" },
          to: [{ email: profile.email, name: profile.name }],
          subject: profile.sponsor_flag
            ? `Sabha Check-in Confirmed & Sponsor Gratitude: ${event.title}`
            : `Sabha Check-in Confirmed: ${event.title}`,
          htmlContent: emailHtml,
        }),
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        alreadyCheckedIn: isDuplicate,
        isSponsor: profile.sponsor_flag,
        sponsorMessage: profile.sponsor_flag ? event.sponsor_message : null,
        eventTitle: event.title,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
