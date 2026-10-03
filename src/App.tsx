import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  Calendar, MapPin, QrCode, CheckCircle2, HeartHandshake, ShieldCheck,
  UserCheck, LogOut, Sparkles, Users, Download, PlusCircle, Award
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
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: '',
    date_time: '',
    venue: '',
    sponsor_message: 'Thank you for your generous sponsorship and devoted support.',
    qr_secret_token: `SABHA-${Date.now().toString().slice(-6)}`
  });

  useEffect(() => {
    const handleUrlConfirmation = async () => {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get('token_hash');
      const type = params.get('type') as any;

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (!error) {
          setVerificationMessage('Email successfully verified! You are now signed in.');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    };

    handleUrlConfirmation();

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
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      const { error } = await supabase.auth.signUp({
        email: authEmail,
        password: authPassword,
        options: {
          data: { name: authName, role: 'ATTENDEE' },
          emailRedirectTo: 'https://3880001.github.io/dynamic-sabha-app/'
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
    else alert(`RSVP recorded: ${status}`);
  };

  // Super Admin: Change User Role (ATTENDEE / ORGANIZER / SUPER_ADMIN)
  const handleUpdateRole = async (targetUserId: string, newRole: string) => {
    if (profile?.role !== 'SUPER_ADMIN') {
      alert('Only Sabha Super Admins can reassign roles.');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUserId);

    if (error) alert(error.message);
    else {
      setAllUsers((prev) => prev.map((u) => u.id === targetUserId ? { ...u, role: newRole } : u));
      alert('User role updated successfully.');
    }
  };

  // Super Admin: Toggle Sponsor Recognition
  const handleToggleSponsor = async (targetUserId: string, currentStatus: boolean) => {
    if (profile?.role !== 'SUPER_ADMIN') {
      alert('Only Sabha Super Admins can manage sponsor tags.');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ sponsor_flag: !currentStatus })
      .eq('id', targetUserId);

    if (error) alert(error.message);
    else {
      setAllUsers((prev) => prev.map((u) => u.id === targetUserId ? { ...u, sponsor_flag: !currentStatus } : u));
    }
  };

  // Organizer / Admin: Create New Sabha Event
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('events').insert({
      title: newEvent.title,
      date_time: new Date(newEvent.date_time).toISOString(),
      venue: newEvent.venue,
      sponsor_message: newEvent.sponsor_message,
      qr_secret_token: newEvent.qr_secret_token,
      created_by: session.user.id
    });

    if (error) alert(error.message);
    else {
      alert(`Event "${newEvent.title}" published!`);
      setShowEventModal(false);
      loadEvents();
    }
  };

  // CSV Report Generator
  const exportAttendanceCSV = () => {
    if (attendanceStats.length === 0) return alert('No attendance records found to export.');
    const headers = ['Devotee Name', 'Email', 'Event', 'Check-In Timestamp', 'Sponsor Attendance'];
    const rows = attendanceStats.map((a) => [
      `"${a.profiles?.name || ''}"`,
      `"${a.profiles?.email || ''}"`,
      `"${a.events?.title || ''}"`,
      `"${new Date(a.checkin_time).toLocaleString()}"`,
      a.is_sponsor_checkin ? 'Yes' : 'No'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sabha_attendance_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // QR Scanner Lifecycle
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
          loadAdminData();
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

  return (
    <div className="max-w-md mx-auto min-h-screen bg-[#FAF6F0] pb-24">
      {/* Header */}
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

      {/* Main Tabs */}
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
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      QR: {ev.qr_secret_token}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-slate-600 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#C56B27]" />
                      {new Date(ev.date_time).toLocaleDateString([], {
                        weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                    <p className="text-xs text-slate-600 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#C56B27]" /> {ev.venue}
                    </p>
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

        {/* TAB 2: QR CHECK-IN */}
        {activeTab === 'scan' && (
          <div className="bg-white border border-[#E7DECE] rounded-3xl p-6 text-center shadow-sm">
            <h2 className="text-xl font-serif font-bold text-[#781D26] mb-1">Entrance Check-In</h2>
            <p className="text-xs text-slate-500 mb-4">Point your camera at the entrance QR code poster.</p>

            {!scanStatus ? (
              <div id="qr-box" className="w-full max-w-xs mx-auto overflow-hidden rounded-2xl border-2 border-[#E7DECE] bg-black" />
            ) : scanStatus.error ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
                <p className="font-bold text-sm">Check-in Error</p>
                <p className="text-xs mt-1">{scanStatus.error}</p>
                <button onClick={() => setScanStatus(null)} className="mt-4 px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg">
                  Scan Again
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

        {/* TAB 3: ROLES, GOVERNANCE & ORGANIZER CONSOLE */}
        {activeTab === 'admin' && (profile?.role === 'SUPER_ADMIN' || profile?.role === 'ORGANIZER') && (
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-[#E7DECE] rounded-2xl p-4 text-center">
                <Users className="w-5 h-5 text-[#C56B27] mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase text-slate-400">Total Devotees</p>
                <p className="text-2xl font-black text-slate-800">{allUsers.length}</p>
              </div>
              <div className="bg-white border border-[#E7DECE] rounded-2xl p-4 text-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase text-slate-400">Live Check-Ins</p>
                <p className="text-2xl font-black text-emerald-700">{attendanceStats.length}</p>
              </div>
            </div>

            {/* Event Management & CSV Actions */}
            <div className="bg-white border border-[#E7DECE] rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-serif font-bold text-slate-900 text-sm">Organizer Controls</h3>
                <button
                  onClick={exportAttendanceCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF6F0] hover:bg-slate-100 border border-[#E7DECE] rounded-lg text-xs font-semibold text-slate-700"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              </div>
              <button
                onClick={() => setShowEventModal(!showEventModal)}
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
                      placeholder="e.g. Sunday Youth Sabha"
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
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Mandir / Venue</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Haveli Assembly Hall"
                      value={newEvent.venue}
                      onChange={(e) => setNewEvent({ ...newEvent, venue: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase">Sponsor Custom Gratitude Message</label>
                    <textarea
                      rows={2}
                      value={newEvent.sponsor_message}
                      onChange={(e) => setNewEvent({ ...newEvent, sponsor_message: e.target.value })}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                    />
                  </div>
                  <button type="submit" className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">
                    Publish Sabha
                  </button>
                </form>
              )}
            </div>

            {/* User Roles & Sponsor Governance Table */}
            <div className="bg-white border border-[#E7DECE] rounded-2xl p-4">
              <h3 className="font-serif font-bold text-slate-900 text-sm mb-1">User Governance & Roles</h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Manage roles (Super Admin, Organizer, Attendee) and designate sponsors.
              </p>

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
                        title="Click to toggle sponsor"
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
