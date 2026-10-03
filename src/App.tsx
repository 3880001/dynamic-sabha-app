import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  Calendar, MapPin, QrCode, CheckCircle2, HeartHandshake, ShieldCheck,
  UserCheck, LogOut, Sparkles, Users, Download, PlusCircle, Award, ListChecks,
  Printer, X, Navigation, LocateFixed
} from 'lucide-react';

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
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  // Admin & Management State
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<any[]>([]);
  const [rsvpStats, setRsvpStats] = useState<any[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  // Active QR Poster Modal State
  const [selectedEventForQR, setSelectedEventForQR] = useState<any | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const generateRandomToken = () =>
    `SABHA-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;

  const [newEvent, setNewEvent] = useState({
    title: '',
    date_time: '',
    venue: '',
    address: '',
    latitude: '' as string | number,
    longitude: '' as string | number,
    radius_meters: 300,
    sponsor_message: 'Thank you for your generous sponsorship and devoted support.',
    qr_secret_token: generateRandomToken(),
  });

  // Extract clean token from either full URL or raw string
  const extractToken = (scannedText: string) => {
    try {
      if (scannedText.includes('checkin=')) {
        const url = new URL(scannedText);
        return url.searchParams.get('checkin') || scannedText;
      }
    } catch {
      // not a valid url structure, return as raw token
    }
    return scannedText.trim();
  };

  const executeCheckIn = async (token: string) => {
    setActiveTab('scan');

    // Retrieve active session token directly from Supabase client
    const { data: { session: freshSession } } = await supabase.auth.getSession();
    const accessToken = freshSession?.access_token || session?.access_token;

    if (!accessToken) {
      setScanStatus({ error: 'Please sign in to complete check-in.' });
      return;
    }

    const performPost = async (lat?: number, lng?: number) => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ qrSecretToken: token, userLat: lat, userLng: lng }),
        });
        const data = await res.json();
        setScanStatus(data);
        loadAdminData();
      } catch {
        setScanStatus({ error: 'Network error checking in.' });
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => performPost(pos.coords.latitude, pos.coords.longitude),
        () => performPost(),
        { enableHighAccuracy: true, timeout: 7000 }
      );
    } else {
      performPost();
    }
  };
  useEffect(() => {
    // 1. Check for token_hash (Email confirmation) or checkin (Camera scan) in URL
    const handleUrlParams = async (currentSession: any) => {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get('token_hash');
      const type = params.get('type') as any;
      const checkinToken = params.get('checkin');

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (!error) {
          setVerificationMessage('Email successfully verified! You are now signed in.');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      if (checkinToken) {
  window.history.replaceState({}, document.title, window.location.pathname);
  executeCheckIn(checkinToken);
}

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        handleUrlParams(session);
      } else {
        handleUrlParams(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        handleUrlParams(session);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      if (data.role === 'SUPER_ADMIN' || data.role === 'ORGANIZER') {
        loadAdminData();
      }
    }
    loadEvents();
  };

  const loadEvents = async () => {
    const { data } = await supabase.from('events').select('*').order('date_time', { ascending: true });
    if (data) setEvents(data);
  };

  const loadAdminData = async () => {
    const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (users) setAllUsers(users);

    const { data: attendance } = await supabase.from('attendance').select('*, profiles(name, email), events(title)');
    if (attendance) setAttendanceStats(attendance);

    const { data: rsvps } = await supabase.from('rsvp').select('*, profiles(name, email), events(title)').order('created_at', { ascending: false });
    if (rsvps) setRsvpStats(rsvps);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          data: { name: authName, role: 'ATTENDEE' },
          emailRedirectTo: 'https://3880001.github.io/dynamic-sabha-app/',
        },
      });
      if (error) alert(error.message);
      else alert('Jai Swaminarayan! Verification link sent to your email.');
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
    else {
      alert(`RSVP recorded: ${status}`);
      loadAdminData();
    }
  };

  const handleGeocodeAddress = async () => {
    if (!newEvent.address.trim()) {
      alert('Please enter a street address first.');
      return;
    }
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newEvent.address)}`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        setNewEvent((prev) => ({
          ...prev,
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        }));
        alert(`Location verified: Lat ${parseFloat(data[0].lat).toFixed(4)}, Lon ${parseFloat(data[0].lon).toFixed(4)}`);
      } else {
        alert('Could not find GPS coordinates for this address. Please ensure street name and city are accurate.');
      }
    } catch {
      alert('Error fetching coordinates. You can set current location instead.');
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setNewEvent((prev) => ({
            ...prev,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }));
          alert('Current location set as venue coordinates.');
        },
        () => alert('Could not retrieve current location. Please grant browser permission.')
      );
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.address.trim()) {
      alert('Please provide the physical street address for the Sabha venue.');
      return;
    }

    const tokenToSave = newEvent.qr_secret_token || generateRandomToken();

    const { error } = await supabase.from('events').insert({
      title: newEvent.title,
      date_time: new Date(newEvent.date_time).toISOString(),
      venue: newEvent.venue,
      address: newEvent.address,
      latitude: newEvent.latitude ? parseFloat(String(newEvent.latitude)) : null,
      longitude: newEvent.longitude ? parseFloat(String(newEvent.longitude)) : null,
      radius_meters: newEvent.radius_meters || 300,
      sponsor_message: newEvent.sponsor_message,
      qr_secret_token: tokenToSave,
      created_by: session.user.id,
    });

    if (error) {
      alert(error.message);
    } else {
      alert(`Event "${newEvent.title}" published!`);
      setShowEventModal(false);
      setNewEvent({
        title: '',
        date_time: '',
        venue: '',
        address: '',
        latitude: '',
        longitude: '',
        radius_meters: 300,
        sponsor_message: 'Thank you for your generous sponsorship and devoted support.',
        qr_secret_token: generateRandomToken(),
      });
      loadEvents();
    }
  };

  // Encodes the full web link into the QR code poster
  const openQRPoster = (event: any) => {
    setSelectedEventForQR(event);
    const deepLinkUrl = `https://3880001.github.io/dynamic-sabha-app/?checkin=${encodeURIComponent(event.qr_secret_token)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=8&data=${encodeURIComponent(deepLinkUrl)}`;
    setQrDataUrl(qrUrl);
  };

  const handleUpdateRole = async (targetUserId: string, newRole: string) => {
    if (profile?.role !== 'SUPER_ADMIN') {
      alert('Only Sabha Super Admins can reassign roles.');
      return;
    }
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', targetUserId);
    if (error) alert(error.message);
    else {
      setAllUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, role: newRole } : u)));
      alert('User role updated successfully.');
    }
  };

  const handleToggleSponsor = async (targetUserId: string, currentStatus: boolean) => {
    if (profile?.role !== 'SUPER_ADMIN') {
      alert('Only Sabha Super Admins can manage sponsor tags.');
      return;
    }
    const { error } = await supabase.from('profiles').update({ sponsor_flag: !currentStatus }).eq('id', targetUserId);
    if (error) alert(error.message);
    else {
      setAllUsers((prev) => prev.map((u) => (u.id === targetUserId ? { ...u, sponsor_flag: !currentStatus } : u)));
    }
  };

  const exportAttendanceCSV = () => {
    if (attendanceStats.length === 0) return alert('No attendance records found to export.');
    const headers = ['Devotee Name', 'Email', 'Event', 'Check-In Timestamp', 'Sponsor Attendance'];
    const rows = attendanceStats.map((a) => [
      `"${a.profiles?.name || ''}"`,
      `"${a.profiles?.email || ''}"`,
      `"${a.events?.title || ''}"`,
      `"${new Date(a.checkin_time).toLocaleString()}"`,
      a.is_sponsor_checkin ? 'Yes' : 'No',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadFile(csvContent, `sabha_attendance_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const exportRsvpCSV = () => {
    if (rsvpStats.length === 0) return alert('No RSVP records found to export.');
    const headers = ['Devotee Name', 'Email', 'Event', 'RSVP Status', 'Submitted At'];
    const rows = rsvpStats.map((r) => [
      `"${r.profiles?.name || ''}"`,
      `"${r.profiles?.email || ''}"`,
      `"${r.events?.title || ''}"`,
      `"${r.status}"`,
      `"${new Date(r.created_at).toLocaleString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadFile(csvContent, `sabha_rsvp_roster_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadFile = (content: string, filename: string) => {
    const encodedUri = encodeURI(content);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // In-app QR Scanner: accepts both URL format and raw token
  useEffect(() => {
    if (activeTab !== 'scan') return;
    const scanner = new Html5QrcodeScanner('qr-box', { fps: 10, qrbox: 250 }, false);

    scanner.render(
      (decodedText) => {
        scanner.clear();
        const cleanToken = extractToken(decodedText);
        executeCheckIn(cleanToken, session);
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [activeTab, session]);

  if (!session) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex flex-col justify-center items-center px-4 py-8">
        <div className="w-full max-w-sm bg-white border border-[#E7DECE] rounded-3xl p-6 shadow-md text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-tr from-[#781D26] to-[#C56B27] flex items-center justify-center text-white shadow-inner">
            <Sparkles className="w-8 h-8 text-amber-200" />
          </div>
          <span className="text-xs uppercase tracking-widest font-bold text-[#C56B27]">BAPS Swaminarayan Sanstha</span>
          <h1 className="text-2xl font-serif font-bold text-[#781D26] mt-1">Dynamic Sabha Portal</h1>
          <p className="text-xs text-slate-500 mt-1 mb-4">Attendance & Event Check-In</p>

          {verificationMessage && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
              {verificationMessage}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4 text-left">
            {isRegistering && (
              <div>
                <label className="text-xs font-semibold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Patel"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-[#C56B27]"
                />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-700">Email Address</label>
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-[#C56B27]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:border-[#C56B27]"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-[#C56B27] to-[#781D26] text-white rounded-xl text-sm font-bold shadow"
            >
              {isRegistering ? 'Register for Sabha' : 'Sign In'}
            </button>
          </form>

          <button
            onClick={() => { setIsRegistering(!isRegistering); setVerificationMessage(null); }}
            className="w-full text-center text-xs text-[#781D26] font-medium mt-5 underline"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'First time attendee? Register here'}
          </button>
        </div>
      </div>
    );
  }

  const confirmedRsvpsCount = rsvpStats.filter((r) => r.status === 'Yes').length;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#FAF6F0] pb-24">
      <header className="bg-white border-b border-[#E7DECE] px-4 py-3 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#781D26] to-[#C56B27] flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5 text-amber-200" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-wider uppercase text-[#C56B27]">Jai Swaminarayan</p>
            <h2 className="text-base font-serif font-bold text-slate-900 leading-tight flex items-center gap-1.5">
              {profile?.name || 'Devotee'}
              {profile?.role === 'SUPER_ADMIN' && (
                <span className="text-[9px] bg-red-100 text-red-800 font-bold px-1.5 py-0.2 rounded border border-red-200">
                  SUPER ADMIN
                </span>
              )}
              {profile?.role === 'ORGANIZER' && (
                <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded border border-blue-200">
                  ORGANIZER
                </span>
              )}
            </h2>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="p-2 text-slate-400 hover:text-[#781D26]">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="p-4">
        {/* TAB 1: SABHA EVENTS FEED */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-lg font-serif font-bold text-[#781D26]">Sabha Assemblies</h2>
              <span className="text-[11px] bg-amber-100 text-[#C56B27] font-semibold px-2 py-0.5 rounded-full border border-amber-200">
                Weekly Satsang
              </span>
            </div>

            {events.length === 0 ? (
              <div className="bg-white border border-[#E7DECE] rounded-2xl p-8 text-center text-slate-400 text-sm">
                No scheduled assemblies found.
              </div>
            ) : (
              events.map((ev) => (
                <div key={ev.event_id} className="bg-white border border-[#E7DECE] rounded-2xl p-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <h3 className="font-serif font-bold text-lg text-slate-900">{ev.title}</h3>
                    {(profile?.role === 'SUPER_ADMIN' || profile?.role === 'ORGANIZER') && (
                      <button
                        onClick={() => openQRPoster(ev)}
                        className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[#C56B27] px-2.5 py-1 rounded-lg text-xs font-bold transition"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Entrance QR
                      </button>
                    )}
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    <p className="text-xs text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#C56B27] shrink-0" />
                      {new Date(ev.date_time).toLocaleDateString([], {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#C56B27] shrink-0" />
                      {ev.venue}
                    </p>
                    {ev.address && (
                      <div className="pl-5 flex items-start justify-between gap-2">
                        <p className="text-[11px] text-slate-500 leading-snug">{ev.address}</p>
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(`${ev.venue}, ${ev.address}`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1 text-[10px] text-[#C56B27] hover:underline font-bold"
                        >
                          <Navigation className="w-3 h-3" /> Directions
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#F2ECE1] flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">RSVP</span>
                    <div className="flex gap-1.5">
                      {(['Yes', 'Maybe', 'No'] as const).map((choice) => (
                        <button
                          key={choice}
                          onClick={() => handleRSVP(ev.event_id, choice)}
                          className="px-3 py-1 bg-[#FAF6F0] hover:bg-[#C56B27] hover:text-white border border-[#E7DECE] rounded-lg text-xs font-semibold text-slate-700 transition"
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

        {/* TAB 2: ATTENDEE QR SCANNER */}
        {activeTab === 'scan' && (
          <div className="bg-white border border-[#E7DECE] rounded-3xl p-6 text-center shadow-sm">
            <h2 className="text-xl font-serif font-bold text-[#781D26] mb-1">Entrance Check-In</h2>
            <p className="text-xs text-slate-500 mb-4">Point your camera at the entrance QR poster at the venue.</p>

            {!scanStatus ? (
              <div id="qr-box" className="w-full max-w-xs mx-auto overflow-hidden rounded-2xl border-2 border-[#E7DECE] bg-black" />
            ) : scanStatus.error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-left">
                <p className="font-bold text-sm">Check-in Rejected</p>
                <p className="text-xs mt-1 leading-relaxed">{scanStatus.error}</p>
                <button
                  onClick={() => setScanStatus(null)}
                  className="mt-4 w-full py-2 bg-red-600 text-white text-xs font-semibold rounded-lg"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="py-2">
                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <h3 className="font-serif font-bold text-xl text-slate-900">Jai Swaminarayan!</h3>
                <p className="text-sm font-semibold text-[#781D26] mt-1">Attendance Registered</p>
                <p className="text-xs text-slate-500 mt-0.5">{scanStatus.eventTitle}</p>

                {scanStatus.isSponsor && (
                  <div className="mt-5 p-4 bg-gradient-to-br from-[#FFF9F2] to-[#FAF1E3] border border-[#E7DECE] rounded-2xl text-left shadow-sm">
                    <div className="flex items-center gap-1.5 text-[#C56B27] font-bold text-xs uppercase tracking-wide">
                      <HeartHandshake className="w-4 h-4" /> Sponsor Gratitude
                    </div>
                    <p className="text-xs text-[#78281F] mt-1.5 leading-relaxed italic">
                      "{scanStatus.sponsorMessage}"
                    </p>
                  </div>
                )}
                <button
                  onClick={() => { setScanStatus(null); setActiveTab('events'); }}
                  className="mt-6 w-full py-2.5 bg-gradient-to-r from-[#C56B27] to-[#781D26] text-white text-xs font-bold rounded-xl shadow"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ADMIN & ORGANIZER CONSOLE */}
        {activeTab === 'admin' && (profile?.role === 'SUPER_ADMIN' || profile?.role === 'ORGANIZER') && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white border border-[#E7DECE] rounded-2xl p-3 text-center">
                <Users className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                <p className="text-[9px] font-bold uppercase text-slate-400">Registered</p>
                <p className="text-xl font-black text-slate-800">{allUsers.length}</p>
              </div>
              <div className="bg-white border border-[#E7DECE] rounded-2xl p-3 text-center">
                <ListChecks className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-[9px] font-bold uppercase text-blue-600">RSVP Yes</p>
                <p className="text-xl font-black text-blue-700">{confirmedRsvpsCount}</p>
              </div>
              <div className="bg-white border border-[#E7DECE] rounded-2xl p-3 text-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <p className="text-[9px] font-bold uppercase text-emerald-600">Live Scanned</p>
                <p className="text-xl font-black text-emerald-700">{attendanceStats.length}</p>
              </div>
            </div>

            {/* Event Management & Creator */}
            <div className="bg-white border border-[#E7DECE] rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-serif font-bold text-slate-900 text-sm">Organizer Controls</h3>
                <div className="flex gap-1.5">
                  <button
                    onClick={exportRsvpCSV}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#FAF6F0] hover:bg-slate-100 border border-[#E7DECE] rounded-lg text-[11px] font-semibold text-slate-700"
                  >
                    <Download className="w-3 h-3" /> RSVP CSV
                  </button>
                  <button
                    onClick={exportAttendanceCSV}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#FAF6F0] hover:bg-slate-100 border border-[#E7DECE] rounded-lg text-[11px] font-semibold text-slate-700"
                  >
                    <Download className="w-3 h-3" /> Check-In CSV
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setNewEvent({ ...newEvent, qr_secret_token: generateRandomToken() });
                  setShowEventModal(!showEventModal);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-[#C56B27] to-[#781D26] text-white rounded-xl text-xs font-bold shadow"
              >
                <PlusCircle className="w-4 h-4" /> Schedule New Sabha Event
              </button>

              {/* Event Creation Form */}
              {showEventModal && (
                <form onSubmit={handleCreateEvent} className="pt-3 border-t border-[#E7DECE] space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Sabha Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sunday Satsang Sabha"
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Date & Time</label>
                    <input
                      type="datetime-local"
                      required
                      value={newEvent.date_time}
                      onChange={(e) => setNewEvent({ ...newEvent, date_time: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Venue Name / Hall</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Main Assembly Hall"
                      value={newEvent.venue}
                      onChange={(e) => setNewEvent({ ...newEvent, venue: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 uppercase">Physical Street Address</label>
                      <button
                        type="button"
                        onClick={handleGeocodeAddress}
                        disabled={isGeocoding}
                        className="text-[10px] text-[#C56B27] font-bold hover:underline"
                      >
                        {isGeocoding ? 'Looking up...' : 'Verify Address GPS'}
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 61 Claireville Dr, Etobicoke, ON M9W 5Z7"
                      value={newEvent.address}
                      onChange={(e) => setNewEvent({ ...newEvent, address: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>

                  <div className="p-3 bg-[#FAF6F0] border border-[#E7DECE] rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-700 uppercase">Physical Geofencing</span>
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        className="flex items-center gap-1 text-[10px] text-[#C56B27] font-bold"
                      >
                        <LocateFixed className="w-3 h-3" /> Set from Current GPS
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-600">
                      <div>Lat: {newEvent.latitude || 'Not set'}</div>
                      <div>Lon: {newEvent.longitude || 'Not set'}</div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500">Allowed Scan Radius (Meters)</label>
                      <input
                        type="number"
                        min="100"
                        max="2000"
                        value={newEvent.radius_meters}
                        onChange={(e) => setNewEvent({ ...newEvent, radius_meters: parseInt(e.target.value) || 300 })}
                        className="w-full mt-0.5 px-2 py-1 border rounded text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Sponsor Gratitude Note</label>
                    <textarea
                      rows={2}
                      value={newEvent.sponsor_message}
                      onChange={(e) => setNewEvent({ ...newEvent, sponsor_message: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>

                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-[10px] uppercase font-bold text-amber-800">Auto-Generated QR Token</p>
                    <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{newEvent.qr_secret_token}</p>
                  </div>

                  <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">
                    Publish Sabha & Enable Geo-Protection
                  </button>
                </form>
              )}
            </div>

            {/* List of Scheduled Events with Entrance QR Launcher */}
            <div className="bg-white border border-[#E7DECE] rounded-2xl p-4">
              <h3 className="font-serif font-bold text-slate-900 text-sm mb-1">Active Assembly QR Codes</h3>
              <p className="text-[11px] text-slate-500 mb-3">Launch or print the entrance check-in poster for attendees.</p>

              <div className="space-y-2">
                {events.map((ev) => (
                  <div key={ev.event_id} className="p-3 bg-[#FAF6F0] border border-[#E7DECE] rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-bold text-slate-900 text-xs">{ev.title}</p>
                      <p className="text-[10px] text-slate-500">{ev.address || ev.venue}</p>
                    </div>
                    <button
                      onClick={() => openQRPoster(ev)}
                      className="flex items-center gap-1.5 bg-[#C56B27] hover:bg-[#781D26] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm"
                    >
                      <QrCode className="w-3.5 h-3.5" /> Launch QR
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* RSVP Roster Section */}
            <div className="bg-white border border-[#E7DECE] rounded-2xl p-4">
              <h3 className="font-serif font-bold text-slate-900 text-sm mb-1">RSVP Roster</h3>
              <p className="text-[11px] text-slate-500 mb-3">Devotees who have submitted their attendance intention.</p>

              {rsvpStats.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">No RSVP submissions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {rsvpStats.map((r) => (
                    <div key={r.rsvp_id} className="p-2.5 bg-[#FAF6F0] border border-[#E7DECE] rounded-xl flex justify-between items-center text-xs">
                      <div>
                        <p className="font-bold text-slate-900">{r.profiles?.name || 'Devotee'}</p>
                        <p className="text-[10px] text-slate-500">{r.events?.title}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.status === 'Yes' ? 'bg-emerald-100 text-emerald-800' :
                        r.status === 'Maybe' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* User Roles & Sponsor Governance */}
            <div className="bg-white border border-[#E7DECE] rounded-2xl p-4">
              <h3 className="font-serif font-bold text-slate-900 text-sm mb-1">User Governance & Roles</h3>
              <p className="text-[11px] text-slate-500 mb-3">Manage roles (Super Admin, Organizer, Attendee) and sponsors.</p>

              <div className="space-y-3">
                {allUsers.map((u) => (
                  <div key={u.id} className="p-3 bg-[#FAF6F0] border border-[#E7DECE] rounded-xl flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-bold text-slate-900 text-xs">{u.name}</p>
                        <p className="text-[11px] text-slate-500">{u.email}</p>
                      </div>
                      <button
                        disabled={profile?.role !== 'SUPER_ADMIN'}
                        onClick={() => handleToggleSponsor(u.id, u.sponsor_flag)}
                        className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition ${
                          u.sponsor_flag
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        <Award className="w-3 h-3" />
                        {u.sponsor_flag ? 'Sponsor' : 'Devotee'}
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#E7DECE]/60">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase">Role</span>
                      <select
                        disabled={profile?.role !== 'SUPER_ADMIN'}
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        <option value="ATTENDEE">ATTENDEE</option>
                        <option value="ORGANIZER">ORGANIZER</option>
                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ENTRANCE QR POSTER MODAL */}
      {selectedEventForQR && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#FAF6F0] border-2 border-[#C56B27] rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl relative">
            <button
              onClick={() => setSelectedEventForQR(null)}
              className="absolute top-4 right-4 p-2 bg-slate-200 hover:bg-slate-300 rounded-full text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-tr from-[#781D26] to-[#C56B27] flex items-center justify-center text-white shadow">
              <Sparkles className="w-6 h-6 text-amber-200" />
            </div>

            <p className="text-[10px] font-bold uppercase tracking-wider text-[#C56B27]">BAPS Swaminarayan Sanstha</p>
            <h2 className="text-xl font-serif font-black text-[#781D26] mt-0.5">{selectedEventForQR.title}</h2>
            <p className="text-xs font-bold text-slate-800 mt-1">{selectedEventForQR.venue}</p>
            {selectedEventForQR.address && (
              <p className="text-[11px] text-slate-500 mt-0.5 px-4">{selectedEventForQR.address}</p>
            )}

            <div className="my-4 p-4 bg-white border border-[#E7DECE] rounded-2xl shadow-inner inline-block">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Entrance QR Code" className="w-52 h-52 mx-auto" />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-xs text-slate-400">Loading QR...</div>
              )}
            </div>

            <p className="text-xs font-serif font-bold text-slate-800">
              Scan with phone camera or Sabha App
            </p>
            <p className="text-[10px] font-mono text-slate-400 mt-1">
              Token: {selectedEventForQR.qr_secret_token}
            </p>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-[#C56B27] to-[#781D26] text-white rounded-xl text-xs font-bold shadow"
              >
                <Printer className="w-4 h-4" /> Print Poster
              </button>
              <button
                onClick={() => setSelectedEventForQR(null)}
                className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-[#E7DECE] flex justify-around py-3 z-20">
        <button
          onClick={() => setActiveTab('events')}
          className={`flex flex-col items-center text-xs ${activeTab === 'events' ? 'text-[#C56B27] font-bold' : 'text-slate-400'}`}
        >
          <Calendar className="w-5 h-5 mb-0.5" /> Sabha
        </button>
        <button
          onClick={() => { setActiveTab('scan'); setScanStatus(null); }}
          className={`flex flex-col items-center text-xs ${activeTab === 'scan' ? 'text-[#C56B27] font-bold' : 'text-slate-400'}`}
        >
          <QrCode className="w-5 h-5 mb-0.5" /> Scan QR
        </button>
        {(profile?.role === 'SUPER_ADMIN' || profile?.role === 'ORGANIZER') && (
          <button
            onClick={() => { setActiveTab('admin'); loadAdminData(); }}
            className={`flex flex-col items-center text-xs ${activeTab === 'admin' ? 'text-[#C56B27] font-bold' : 'text-slate-400'}`}
          >
            <UserCheck className="w-5 h-5 mb-0.5" /> Admin
          </button>
        )}
      </footer>
    </div>
  );
}
