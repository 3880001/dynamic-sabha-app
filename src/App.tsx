import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Calendar, MapPin, QrCode, CheckCircle2, HeartHandshake, ShieldCheck, UserCheck, LogOut } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'events' | 'scan' | 'admin'>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [scanStatus, setScanStatus] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
    loadEvents();
  };

  const loadEvents = async () => {
    const { data } = await supabase.from('events').select('*').order('date_time', { ascending: true });
    if (data) setEvents(data);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      const { data, error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: { data: { name: authName, role: 'ATTENDEE' } },
      });
      if (error) alert(error.message);
      else alert('Registration complete! You can now log in.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) alert(error.message);
    }
  };

  const handleRSVP = async (eventId: string, status: 'Yes' | 'No' | 'Maybe') => {
    if (!session) return;
    const { error } = await supabase.from('rsvp').upsert({
      user_id: session.user.id,
      event_id: eventId,
      status,
    });
    if (error) alert(error.message);
    else alert(`RSVP recorded: ${status}`);
  };

  useEffect(() => {
    if (activeTab !== 'scan') return;
    const scanner = new Html5QrcodeScanner('qr-box', { fps: 10, qrbox: 250 }, false);

    scanner.render(
      async (decodedText) => {
        scanner.clear();
        try {
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ qrSecretToken: decodedText }),
          });
          const data = await res.json();
          setScanStatus(data);
        } catch (err: any) {
          setScanStatus({ error: 'Network error checking in.' });
        }
      },
      () => {}
    );

    return () => { scanner.clear().catch(() => {}); };
  }, [activeTab]);

  if (!session) {
    return (
      <div className="max-w-sm mx-auto min-h-screen flex flex-col justify-center px-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h1 className="text-xl font-black text-slate-800 text-center mb-1">Dynamic Sabha Portal</h1>
          <p className="text-xs text-slate-400 text-center mb-6">Sign in or register to RSVP & check in</p>
          <form onSubmit={handleAuth} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="text-xs font-semibold text-slate-600">Full Name</label>
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-600">Email Address</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Password</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <button type="submit" className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold">
              {isRegistering ? 'Register' : 'Sign In'}
            </button>
          </form>
          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="w-full text-center text-xs text-slate-500 mt-4 underline"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'First time attendee? Register'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen pb-20">
      <nav className="flex justify-between items-center p-4 bg-white border-b">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase">Welcome</span>
          <h2 className="text-lg font-bold text-slate-800 leading-tight">{profile?.name || 'Attendee'}</h2>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="p-2 text-slate-400 hover:text-slate-700">
          <LogOut className="w-5 h-5"/>
        </button>
      </nav>

      <main className="p-4">
        {activeTab === 'events' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-800">Upcoming Sabha Assemblies</h2>
            {events.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No scheduled assemblies found.</p>
            ) : (
              events.map((ev) => (
                <div key={ev.event_id} className="bg-white border rounded-2xl p-4 shadow-sm">
                  <h3 className="font-bold text-slate-900">{ev.title}</h3>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-2">
                    <Calendar className="w-4 h-4 text-amber-600"/>
                    {new Date(ev.date_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                    <MapPin className="w-4 h-4 text-amber-600"/> {ev.venue}
                  </p>
                  <div className="mt-4 pt-3 border-t flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-semibold uppercase">RSVP</span>
                    <div className="flex gap-1.5">
                      {(['Yes', 'Maybe', 'No'] as const).map((choice) => (
                        <button
                          key={choice}
                          onClick={() => handleRSVP(ev.event_id, choice)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-amber-600 hover:text-white rounded-md text-xs font-semibold"
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'scan' && (
          <div className="bg-white border rounded-2xl p-6 text-center">
            <h2 className="text-lg font-bold mb-4">Entrance Check-In</h2>
            {!scanStatus ? (
              <div id="qr-box" className="w-full max-w-xs mx-auto overflow-hidden rounded-xl border" />
            ) : scanStatus.error ? (
              <div className="text-rose-600">
                <p className="font-bold">Error</p>
                <p className="text-xs mt-1">{scanStatus.error}</p>
                <button onClick={() => setScanStatus(null)} className="mt-4 px-4 py-2 bg-slate-100 text-xs font-semibold rounded">
                  Scan Again
                </button>
              </div>
            ) : (
              <div>
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2"/>
                <h3 className="font-bold text-slate-800">Check-in Recorded!</h3>
                <p className="text-xs text-slate-500 mt-1">{scanStatus.eventTitle}</p>
                {scanStatus.isSponsor && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
                    <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                      <HeartHandshake className="w-4 h-4"/> Sponsor Recognition
                    </div>
                    <p className="text-xs text-amber-800 mt-1 italic">"{scanStatus.sponsorMessage}"</p>
                  </div>
                )}
                <button onClick={() => setScanStatus(null)} className="mt-4 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg">
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'admin' && profile?.role !== 'ATTENDEE' && (
          <div className="bg-white border rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600"/>
              <h2 className="font-bold text-slate-800">Organizer Controls</h2>
            </div>
            <p className="text-xs text-slate-500">
              Access level verified: you can configure themes and monitor attendance.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-2">
              <p><strong>Role:</strong> {profile?.role}</p>
              <p><strong>Sponsor Status:</strong> {profile?.sponsor_flag ? 'Yes' : 'No'}</p>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t flex justify-around py-3">
        <button
          onClick={() => setActiveTab('events')}
          className={`flex flex-col items-center text-xs ${activeTab === 'events' ? 'text-amber-600 font-bold' : 'text-slate-400'}`}
        >
          <Calendar className="w-5 h-5 mb-0.5"/> Events
        </button>
        <button
          onClick={() => { setActiveTab('scan'); setScanStatus(null); }}
          className={`flex flex-col items-center text-xs ${activeTab === 'scan' ? 'text-amber-600 font-bold' : 'text-slate-400'}`}
        >
          <QrCode className="w-5 h-5 mb-0.5"/> Scan QR
        </button>
        {profile?.role !== 'ATTENDEE' && (
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center text-xs ${activeTab === 'admin' ? 'text-amber-600 font-bold' : 'text-slate-400'}`}
          >
            <UserCheck className="w-5 h-5 mb-0.5"/> Manage
          </button>
        )}
      </footer>
    </div>
  );
}
