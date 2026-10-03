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
    const body = await req.json().catch(() => ({}));
    const { manualEventId, manualType } = body;

    const now = new Date();

    // 1. Fetch relevant upcoming or live events
    let eventsQuery = supabaseAdmin.from("events").select("*");
    if (manualEventId) {
      eventsQuery = eventsQuery.eq("event_id", manualEventId);
    } else {
      // Find events within 2 days forward or 1 hour past
      const pastBuffer = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const futureBuffer = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
      eventsQuery = eventsQuery.gte("date_time", pastBuffer).lte("date_time", futureBuffer);
    }

    const { data: events, error: evErr } = await eventsQuery;
    if (evErr || !events) throw new Error("Could not fetch events");

    // 2. Fetch all registered devotee profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .not("email", "is", null);

    if (!profiles) return new Response(JSON.stringify({ sent: 0 }), { headers: corsHeaders });

    let sentCount = 0;

    for (const ev of events) {
      const eventTime = new Date(ev.date_time).getTime();
      const diffMinutes = Math.round((eventTime - now.getTime()) / 60000);

      // Determine reminder categories
      // A. Manual RSVP trigger
      // B. T-30 minutes checkin (between 25 and 35 mins before)
      // C. T-15 minutes checkin (between 10 and 20 mins before)
      // D. T+15 minutes live checkin (between -20 and -10 mins after start)

      const jobs: { type: string; subject: string; message: string; targetUsers: any[] }[] = [];

      // Existing RSVPs and Check-ins for this event
      const { data: rsvps } = await supabaseAdmin.from("rsvp").select("user_id, status").eq("event_id", ev.event_id);
      const { data: checkins } = await supabaseAdmin.from("attendance").select("user_id").eq("event_id", ev.event_id);

      const rsvpMap = new Set((rsvps || []).map((r) => r.user_id));
      const checkinMap = new Set((checkins || []).map((c) => c.user_id));

      if (manualType === "rsvp_reminder" || (!manualEventId && diffMinutes > 60)) {
        // Pending RSVP attendees
        const pendingRsvpProfiles = profiles.filter((p) => !rsvpMap.has(p.id));
        jobs.push({
          type: "rsvp_reminder",
          subject: `RSVP Reminder: ${ev.title}`,
          message: `Please complete your RSVP for the upcoming assembly at ${ev.venue}.`,
          targetUsers: pendingRsvpProfiles,
        });
      }

      if (manualType === "checkin_30" || (!manualEventId && diffMinutes >= 25 && diffMinutes <= 35)) {
        // Devotees who RSVP'd Yes or haven't checked in yet
        const pendingCheckins = profiles.filter((p) => !checkinMap.has(p.id));
        jobs.push({
          type: "checkin_minus_30",
          subject: `Reminder (30 Mins): ${ev.title} Entrance Check-In`,
          message: `Assembly starts in 30 minutes at ${ev.venue}. Remember to scan the entrance QR poster upon arrival.`,
          targetUsers: pendingCheckins,
        });
      }

      if (manualType === "checkin_15" || (!manualEventId && diffMinutes >= 10 && diffMinutes <= 20)) {
        const pendingCheckins = profiles.filter((p) => !checkinMap.has(p.id));
        jobs.push({
          type: "checkin_minus_15",
          subject: `Reminder (15 Mins): ${ev.title} Starting Soon`,
          message: `Sabha starts in 15 minutes. Please have your mobile scanner ready at the entrance desk.`,
          targetUsers: pendingCheckins,
        });
      }

      if (manualType === "checkin_live_15" || (!manualEventId && diffMinutes <= -10 && diffMinutes >= -20)) {
        const pendingCheckins = profiles.filter((p) => !checkinMap.has(p.id));
        jobs.push({
          type: "checkin_plus_15",
          subject: `Live Sabha Check-In: ${ev.title}`,
          message: `Sabha is now in session. If you are seated in the hall, please scan the entrance QR poster to record your presence.`,
          targetUsers: pendingCheckins,
        });
      }

      // Execute email delivery via Brevo with notification_logs deduplication
      for (const job of jobs) {
        for (const user of job.targetUsers) {
          // Check if already sent
          const { data: existingLog } = await supabaseAdmin
            .from("notification_logs")
            .select("id")
            .eq("event_id", ev.event_id)
            .eq("user_id", user.id)
            .eq("notification_type", job.type)
            .maybeSingle();

          if (existingLog) continue;

          // Dispatch email
          if (brevoApiKey && user.email) {
            await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: {
                "api-key": brevoApiKey,
                "content-type": "application/json",
              },
              body: JSON.stringify({
                sender: { email: brevoSenderEmail, name: "BAPS Sabha Assembly" },
                to: [{ email: user.email, name: user.name }],
                subject: `Jai Swaminarayan: ${job.subject}`,
                htmlContent: `
                  <div style="font-family: Georgia, serif; max-width: 520px; margin: auto; padding: 24px; border: 1px solid #E7DECE; background-color: #FAF6F0; border-radius: 14px;">
                    <h2 style="color: #781D26; margin-top: 0;">Jai Swaminarayan, ${user.name}</h2>
                    <p style="color: #334155; font-size: 14px; line-height: 1.5;">${job.message}</p>
                    <div style="background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #E7DECE; margin: 16px 0;">
                      <p style="margin: 0; font-weight: bold; color: #1E293B;">${ev.title}</p>
                      <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748B;">${ev.venue} (${ev.address || ''})</p>
                    </div>
                    <a href="https://3880001.github.io/dynamic-sabha-app/" style="display: inline-block; padding: 10px 18px; background-color: #C56B27; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 13px;">Open Sabha App</a>
                  </div>
                `,
              }),
            });

            await supabaseAdmin.from("notification_logs").insert({
              event_id: ev.event_id,
              user_id: user.id,
              notification_type: job.type,
            });

            sentCount++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, emailsSent: sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
