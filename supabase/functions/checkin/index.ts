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
        <div style="font-family: Georgia, serif; max-width: 560px; margin: auto; border: 1px solid #E7DECE; background-color: #FAF6F0; padding: 28px; border-radius: 16px; color: #1E293B;">
          <div style="text-align: center; margin-bottom: 20px;">
            <p style="color: #C56B27; font-size: 13px; font-weight: bold; letter-spacing: 1.5px; text-transform: uppercase; margin: 0;">BAPS Swaminarayan Sanstha</p>
            <h1 style="color: #781D26; margin: 6px 0 0 0; font-size: 24px;">Jai Swaminarayan</h1>
          </div>
          
          <div style="background-color: #ffffff; border: 1px solid #E7DECE; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <h3 style="color: #781D26; margin-top: 0; font-size: 18px;">Attendance Confirmed</h3>
            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
              Dear <strong>${profile.name}</strong>, your attendance has been recorded for today’s divine Sabha:
            </p>
            <p style="font-size: 15px; font-weight: bold; color: #1E293B; margin: 12px 0 4px 0;">${event.title}</p>
            <p style="font-size: 13px; color: #64748B; margin: 0;">Venue: ${event.venue}</p>
          </div>
      `;

      if (profile.sponsor_flag) {
        emailHtml += `
          <div style="background-color: #FFF9F2; border-left: 4px solid #C56B27; border-top: 1px solid #E7DECE; border-right: 1px solid #E7DECE; border-bottom: 1px solid #E7DECE; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; font-weight: bold; color: #C56B27; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Sponsor Gratitude</p>
            <p style="margin: 6px 0 0 0; font-style: italic; color: #78281F; font-size: 14px; line-height: 1.5;">"${event.sponsor_message}"</p>
          </div>
        `;
      }

      emailHtml += `
          <p style="font-size: 11px; text-align: center; color: #94A3B8; margin-top: 24px;">
            Dynamic Sabha Attendance & Event Management System
          </p>
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
