import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  Calendar, MapPin, QrCode, CheckCircle2, HeartHandshake, ShieldCheck,
  UserCheck, LogOut, Sparkles, Users, Download, PlusCircle, Award, ListChecks,
  Printer, X, Navigation, Check, Loader2, User, Plus, Trash2, ChevronDown, ChevronUp,
  MessageSquare, Image as ImageIcon, UploadCloud, Edit3, Lock, Mail, BellRing,
  KeyRound, Share2, Copy, AlertTriangle
} from 'lucide-react';

interface Child {
  name: string;
  age_dob: string;
  phone?: string;
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'events' | 'scan' | 'profile' | 'admin'>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [unlockedEventIds, setUnlockedEventIds] = useState<Set<string>>(new Set());
  const [userRsvps, setUserRsvps] = useState<Record<string, any>>({});
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [scanStatus, setScanStatus] = useState<any>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  // Manual Join Code Modal State
  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [inputJoinCode, setInputJoinCode] = useState('');
  const [isJoiningEvent, setIsJoiningEvent] = useState(false);

  // Profile Edit State
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseDobAge, setSpouseDobAge] = useState('');
  const [spousePhone, setSpousePhone] = useState('');
  const [children, setChildren] = useState<Child[]>([]);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  // Admin & Management State
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<any[]>([]);
  const [rsvpStats, setRsvpStats] = useState<any[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // Per-Event Inspection & Manual Reminders
  const [selectedAdminEventId, setSelectedAdminEventId] = useState<string>('');
  const [activeRosterSubTab, setActiveRosterSubTab] = useState<'completed' | 'pending_rsvp' | 'pending_checkin'>('completed');
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  // In-App Pop-up State for Pending RSVP
  const [showPendingRsvpPopup, setShowPendingRsvpPopup] = useState(false);
  const [popupEvent, setPopupEvent] = useState<any | null>(null);

  // RSVP Modal State
  const [rsvpModalEvent, setRsvpModalEvent] = useState<any | null>(null);
  const [rsvpAdultCount, setRsvpAdultCount] = useState<number>(1);
  const [rsvpChildCount, setRsvpChildCount] = useState<number>(0);
  const [rsvpRemarks, setRsvpRemarks] = useState<string>('');
  const [editingRsvpEventId, setEditingRsvpEventId] = useState<string | null>(null);

  // Flyer Viewer Modal State
  const [selectedFlyerUrl, setSelectedFlyerUrl] = useState<string | null>(null);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [isUploadingFlyer, setIsUploadingFlyer] = useState(false);

  // Live Address Autocomplete State
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const addressWrapperRef = useRef<HTMLDivElement>(null);

  // Active QR Poster Modal State
  const [selectedEventForQR, setSelectedEventForQR] = useState<any | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const generateRandomToken = () =>
    `SABHA-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;

  const generateShortJoinCode = () =>
    `SABHA-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const [newEvent, setNewEvent] = useState({
    title: '',
    date_time: '',
    venue: '',
    address: '',
    sponsor_message: 'Thank you for your generous sponsorship and devoted support.',
    qr_secret_token: generateRandomToken(),
    join_code: generateShortJoinCode(),
  });

  const extractToken = (scannedText: string): string => {
    try {
      if (scannedText.includes('checkin=')) {
        const url = new URL(scannedText);
        return url.searchParams.get('checkin') || scannedText;
      }
    } catch {
      // fallback
    }
    return scannedText.trim();
  };

  const executeCheckIn = async (token: string) => {
    setActiveTab('scan');

    const { data } = await supabase.auth.getSession();
    const accessToken = data?.session?.access_token || session?.access_token;

    if (!accessToken) {
      setScanStatus({ error: 'Please sign in to complete check-in.' });
      return;
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ qrSecretToken: token }),
      });
      const resData = await res.json();
      setScanStatus(resData);
      loadAdminData();
    } catch {
      setScanStatus({ error: 'Network error checking in.' });
    }
  };

  const handleJoinByCode = async (codeToUnlock: string, showToast = true) => {
    if (!codeToUnlock.trim()) return;
    setIsJoiningEvent(true);
    try {
      const { data, error } = await supabase.rpc('unlock_event_by_code', {
        p_code: codeToUnlock.trim(),
      });

      if (error) throw error;

      if (data?.success) {
        if (showToast) alert(`Event unlocked: "${data.title}"!`);
        setShowJoinCodeModal(false);
        setInputJoinCode('');
        if (session) {
          fetchUnlockedEvents(session.user.id);
          loadEvents();
        }
      } else {
        if (showToast) alert(data?.error || 'Invalid Sabha Code.');
      }
    } catch (err: any) {
      if (showToast) alert(`Error: ${err.message}`);
    } finally {
      setIsJoiningEvent(false);
    }
  };

  // Permanent Delete Event (Super Admin Only)
  const handleDeleteEventPermanent = async (eventId: string, title: string) => {
    if (profile?.role !== 'SUPER_ADMIN') {
      alert('Only Super Admin can permanently delete events.');
      return;
    }
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${title}"? This cannot be undone.`
    );
    if (!confirmDelete) return;

    const { error } = await supabase.from('events').delete().eq('event_id', eventId);
    if (error) {
      alert(`Delete failed: ${error.message}`);
    } else {
      alert(`Event "${title}" has been permanently deleted.`);
      loadEvents();
      loadAdminData();
    }
  };

  // Request Deletion (Organizer Workflow)
  const handleRequestDeletion = async (eventId: string, title: string) => {
    const reason = window.prompt(`Please provide a reason to request deletion for "${title}":`);
    if (!reason || !reason.trim()) return;

    const { error } = await supabase
      .from('events')
      .update({
        deletion_requested: true,
        deletion_reason: reason.trim(),
        deletion_requested_by: session.user.id,
      })
      .eq('event_id', eventId);

    if (error) {
      alert(`Error submitting request: ${error.message}`);
    } else {
      alert(`Deletion request submitted to Super Admin for "${title}".`);
      loadEvents();
    }
  };

  // Reject / Cancel Deletion Request (Super Admin)
  const handleRejectDeletionRequest = async (eventId: string, title: string) => {
    const { error } = await supabase
      .from('events')
      .update({
        deletion_requested: false,
        deletion_reason: null,
        deletion_requested_by: null,
      })
      .eq('event_id', eventId);

    if (error) {
      alert(`Error resetting request: ${error.message}`);
    } else {
      alert(`Deletion request for "${title}" has been dismissed.`);
      loadEvents();
    }
  };

  useEffect(() => {
    const handleUrlParams = async (currentSession: any) => {
      const params = new URLSearchParams(window.location.search);
      const token_hash = params.get('token_hash');
      const type = params.get('type') as any;
      const checkinToken = params.get('checkin');
      const joinParam = params.get('join');

      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (!error) {
          setVerificationMessage('Email successfully verified! You are now signed in.');
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      if (checkinToken) {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (currentSession) {
          executeCheckIn(checkinToken);
        }
      }

      if (joinParam && currentSession) {
        window.history.replaceState({}, document.title, window.location.pathname);
        handleJoinByCode(joinParam, false);
      }
    };

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      if (initialSession) {
        fetchProfile(initialSession.user.id);
        fetchUnlockedEvents(initialSession.user.id);
        fetchUserRsvps(initialSession.user.id);
        handleUrlParams(initialSession);
      } else {
        handleUrlParams(null);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        fetchProfile(newSession.user.id);
        fetchUnlockedEvents(newSession.user.id);
        fetchUserRsvps(newSession.user.id);
        handleUrlParams(newSession);
      } else {
        setProfile(null);
        setUnlockedEventIds(new Set());
        setUserRsvps({});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (data) {
      setProfile(data);
      setEditName(data.name || '');
      setEditPhone(data.phone || '');
      setSpouseName(data.spouse_name || '');
      setSpouseDobAge(data.spouse_dob_age || '');
      setSpousePhone(data.spouse_phone || '');
      setChildren(Array.isArray(data.children) ? data.children : []);
      if (data.role === 'SUPER_ADMIN' || data.role === 'ORGANIZER') {
        loadAdminData();
      }
    }
    loadEvents();
  };

  const fetchUnlockedEvents = async (userId: string) => {
    const { data } = await supabase.from('event_access').select('event_id').eq('user_id', userId);
    if (data) {
      setUnlockedEventIds(new Set(data.map((row) => row.event_id)));
    }
  };

  const fetchUserRsvps = async (userId: string) => {
    const { data } = await supabase.from('rsvp').select('*').eq('user_id', userId);
    if (data) {
      const map: Record<string, any> = {};
      data.forEach((r) => {
        map[r.event_id] = r;
      });
      setUserRsvps(map);
    }
  };

  const loadEvents = async () => {
    const { data } = await supabase.from('events').select('*, profiles:deletion_requested_by(name, email)').order('date_time', { ascending: true });
    if (data) {
      setEvents(data);
      if (data.length > 0 && !selectedAdminEventId) {
        setSelectedAdminEventId(data[0].event_id);
      }
    }
  };

  const loadAdminData = async () => {
    const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (users) setAllUsers(users);

    const { data: attendance } = await supabase.from('attendance').select('*, profiles(name, email), events(title)');
    if (attendance) setAttendanceStats(attendance);

    const { data: rsvps } = await supabase.from('rsvp').select('*, profiles(name, email), events(title)').order('created_at', { ascending: false });
    if (rsvps) setRsvpStats(rsvps);
  };

  useEffect(() => {
    if (!session || events.length === 0) return;
    const now = Date.now();
    const upcoming = events.find((ev) => {
      const isFuture = new Date(ev.date_time).getTime() > now;
      const isAccessible = profile?.role === 'SUPER_ADMIN' || profile?.role === 'ORGANIZER' || unlockedEventIds.has(ev.event_id);
      return isFuture && isAccessible && !userRsvps[ev.event_id];
    });

    if (upcoming) {
      setPopupEvent(upcoming);
      setShowPendingRsvpPopup(true);
    }
  }, [events, userRsvps, unlockedEventIds, session, profile]);

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

  const isRsvpSubmittedToday = (submittedAtIso: string): boolean => {
    if (!submittedAtIso) return false;
    const submitted = new Date(submittedAtIso);
    const today = new Date();
    return (
      submitted.getFullYear() === today.getFullYear() &&
      submitted.getMonth() === today.getMonth() &&
      submitted.getDate() === today.getDate()
    );
  };

  const handleRSVPClick = async (event: any, status: 'Yes' | 'No' | 'Maybe') => {
    if (!session) return;
    if (status === 'Yes') {
      const existing = userRsvps[event.event_id];
      setRsvpModalEvent(event);
      setRsvpAdultCount(existing?.adult_count || 1);
      setRsvpChildCount(existing?.child_count || 0);
      setRsvpRemarks(existing?.remarks || '');
    } else {
      const { error } = await supabase.from('rsvp').upsert({
        user_id: session.user.id,
        event_id: event.event_id,
        status,
        adult_count: 0,
        child_count: 0,
        remarks: null,
      });
      if (error) alert(error.message);
      else {
        alert(`RSVP recorded: ${status}`);
        setEditingRsvpEventId(null);
        fetchUserRsvps(session.user.id);
        loadAdminData();
      }
    }
  };

  const handleSubmitYesRSVP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !rsvpModalEvent) return;

    if (rsvpAdultCount < 1) {
      alert('Total attendees (above 9 years) must be at least 1.');
      return;
    }

    const { error } = await supabase.from('rsvp').upsert({
      user_id: session.user.id,
      event_id: rsvpModalEvent.event_id,
      status: 'Yes',
      adult_count: rsvpAdultCount,
      child_count: rsvpChildCount || 0,
      remarks: rsvpRemarks.trim() || null,
    });

    if (error) {
      alert(error.message);
    } else {
      alert(`Jai Swaminarayan! RSVP confirmed for ${rsvpAdultCount + (rsvpChildCount || 0)} total attendees.`);
      setRsvpModalEvent(null);
      setEditingRsvpEventId(null);
      fetchUserRsvps(session.user.id);
      loadAdminData();
    }
  };

  const triggerReminder = async (type: 'rsvp_reminder' | 'checkin_30' | 'checkin_15' | 'checkin_live_15') => {
    if (!selectedAdminEventId) return;
    setIsSendingReminder(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          manualEventId: selectedAdminEventId,
          manualType: type,
        }),
      });
      const result = await res.json();
      alert(`Reminders dispatched successfully! (${result.emailsSent ?? 0} email(s) sent)`);
    } catch (err: any) {
      alert(`Error dispatching reminders: ${err.message}`);
    } finally {
      setIsSendingReminder(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    const { error } = await supabase
      .from('profiles')
      .update({
        name: editName,
        phone: editPhone,
        spouse_name: spouseName,
        spouse_dob_age: spouseDobAge,
        spouse_phone: spousePhone,
        children: children,
      })
      .eq('id', session.user.id);

    if (error) {
      alert(error.message);
    } else {
      setProfile((prev: any) => ({
        ...prev,
        name: editName,
        phone: editPhone,
        spouse_name: spouseName,
        spouse_dob_age: spouseDobAge,
        spouse_phone: spousePhone,
        children: children,
      }));
      setProfileSaveSuccess(true);
      setTimeout(() => setProfileSaveSuccess(false), 3000);
      loadAdminData();
    }
  };

  const addChild = () => setChildren([...children, { name: '', age_dob: '', phone: '' }]);
  const removeChild = (index: number) => setChildren(children.filter((_, i) => i !== index));
  const updateChild = (index: number, field: keyof Child, value: string) => {
    const updated = [...children];
    updated[index] = { ...updated[index], [field]: value };
    setChildren(updated);
  };

  useEffect(() => {
    if (!newEvent.address || newEvent.address.trim().length < 3) {
      setAddressSuggestions([]);
      setShowAddressDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingAddress(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(newEvent.address)}&limit=5&addressdetails=1`
        );
        const data = await res.json();
        if (data && data.length > 0) {
          setAddressSuggestions(data);
          setShowAddressDropdown(true);
        } else {
          setAddressSuggestions([]);
        }
      } catch {
        setAddressSuggestions([]);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [newEvent.address]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addressWrapperRef.current && !addressWrapperRef.current.contains(e.target as Node)) {
        setShowAddressDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAddress = (selectedDisplayName: string) => {
    setNewEvent((prev) => ({ ...prev, address: selectedDisplayName }));
    setShowAddressDropdown(false);
  };

  const copyWhatsAppInvite = (joinCode: string, title: string) => {
    const inviteUrl = `https://3880001.github.io/dynamic-sabha-app/?join=${encodeURIComponent(joinCode)}`;
    const textToShare = `Jai Swaminarayan! Please RSVP for "${title}". Tap this link to view details and submit: ${inviteUrl}`;

    navigator.clipboard.writeText(textToShare).then(
      () => alert(`Invite link copied!\n\n${inviteUrl}`),
      () => alert(`Invite link: ${inviteUrl}`)
    );
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploadingFlyer(true);

    let uploadedFlyerUrl: string | null = null;

    if (flyerFile) {
      const fileExt = flyerFile.name.split('.').pop();
      const fileName = `flyer_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('event-flyers')
        .upload(fileName, flyerFile, { cacheControl: '3600', upsert: false });

      if (uploadErr) {
        alert(`Flyer upload failed: ${uploadErr.message}`);
        setIsUploadingFlyer(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('event-flyers')
        .getPublicUrl(uploadData.path);

      uploadedFlyerUrl = publicUrlData.publicUrl;
    }

    const tokenToSave = newEvent.qr_secret_token || generateRandomToken();
    const joinCodeToSave = newEvent.join_code || generateShortJoinCode();

    const { error } = await supabase.from('events').insert({
      title: newEvent.title,
      date_time: new Date(newEvent.date_time).toISOString(),
      venue: newEvent.venue,
      address: newEvent.address,
      sponsor_message: newEvent.sponsor_message,
      qr_secret_token: tokenToSave,
      join_code: joinCodeToSave,
      flyer_url: uploadedFlyerUrl,
      created_by: session.user.id,
    });

    setIsUploadingFlyer(false);

    if (error) {
      alert(error.message);
    } else {
      alert(`Event "${newEvent.title}" published! Join code: ${joinCodeToSave}`);
      setShowEventModal(false);
      setFlyerFile(null);
      setAddressSuggestions([]);
      setNewEvent({
        title: '',
        date_time: '',
        venue: '',
        address: '',
        sponsor_message: 'Thank you for your generous sponsorship and devoted support.',
        qr_secret_token: generateRandomToken(),
        join_code: generateShortJoinCode(),
      });
      loadEvents();
    }
  };

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

  const downloadFile = (content: string, filename: string) => {
    const encodedUri = encodeURI(content);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    const headers = ['Devotee Name', 'Email', 'Event', 'RSVP Status', 'Adults/9+ yrs', 'Children (<9 yrs)', 'Total Count', 'Remarks', 'Submitted At'];
    const rows = rsvpStats.map((r) => [
      `"${r.profiles?.name || ''}"`,
      `"${r.profiles?.email || ''}"`,
      `"${r.events?.title || ''}"`,
      `"${r.status}"`,
      r.adult_count || (r.status === 'Yes' ? 1 : 0),
      r.child_count || 0,
      (r.adult_count || (r.status === 'Yes' ? 1 : 0)) + (r.child_count || 0),
      `"${r.remarks || ''}"`,
      `"${new Date(r.created_at).toLocaleString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    downloadFile(csvContent, `sabha_rsvp_roster_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  useEffect(() => {
    if (activeTab !== 'scan') return;
    const scanner = new Html5QrcodeScanner('qr-box', { fps: 10, qrbox: 250 }, false);

    scanner.render(
      (decodedText) => {
        scanner.clear();
        const cleanToken = extractToken(decodedText);
        executeCheckIn(cleanToken);
      },
      () => {}
    );

    return () => {
      scanner.clear().catch(() => {});
    };
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

  const visibleEvents = events.filter((ev) => {
    const isFuture = new Date(ev.date_time).getTime() > Date.now();
    if (!isFuture) return false;
    if (profile?.role === 'SUPER_ADMIN' || profile?.role === 'ORGANIZER') return true;
    return unlockedEventIds.has(ev.event_id);
  });

  const confirmedYesRsvps = rsvpStats.filter((r) => r.status === 'Yes');
  const totalHeadcount = confirmedYesRsvps.reduce(
    (sum, r) => sum + (Number(r.adult_count) || 1) + (Number(r.child_count) || 0),
    0
  );

  // Events that have pending deletion requests for Super Admin review
  const deletionRequestedEvents = events.filter((ev) => ev.deletion_requested === true);

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
        <button onClick={() => supabase.auth.signOut()} className="p-2 text-slate-400 hover:text-[#781D26]" title="Sign Out">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="p-4">
        {/* TAB 1: SABHA KARYAKRAM FEED */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-lg font-serif font-bold text-[#781D26]">Sabha Karyakram</h2>
              <button
                type="button"
                onClick={() => setShowJoinCodeModal(true)}
                className="flex items-center gap-1 text-[11px] bg-white border border-[#E7DECE] text-[#C56B27] font-bold px-2.5 py-1 rounded-full hover:bg-amber-50 shadow-sm"
              >
                <KeyRound className="w-3.5 h-3.5" /> + Enter Sabha Code
              </button>
            </div>

            {visibleEvents.length === 0 ? (
              <div className="bg-white border border-[#E7DECE] rounded-2xl p-8 text-center space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed">
                  No upcoming karyakrams currently assigned to your feed. If your local center provided a Sabha Code or WhatsApp invitation link, tap below to unlock it.
                </p>
                <button
                  type="button"
                  onClick={() => setShowJoinCodeModal(true)}
                  className="px-4 py-2 bg-gradient-to-r from-[#C56B27] to-[#781D26] text-white text-xs font-bold rounded-xl shadow inline-flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Enter Sabha Code
                </button>
              </div>
            ) : (
              visibleEvents.map((ev) => {
                const userRsvp = userRsvps[ev.event_id];
                const isCompleted = !!userRsvp;
                const isEditing = editingRsvpEventId === ev.event_id;
                const lockedToday = isCompleted && isRsvpSubmittedToday(userRsvp.created_at);
                const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
                const isOrganizer = profile?.role === 'ORGANIZER';
                const isStaff = isSuperAdmin || isOrganizer;

                return (
                  <div key={ev.event_id} className="bg-white border border-[#E7DECE] rounded-2xl p-4 shadow-sm overflow-hidden relative">
                    {/* Event Flyer */}
                    {ev.flyer_url && (
                      <div
                        className="mb-3 rounded-xl overflow-hidden border border-[#E7DECE] relative group cursor-pointer"
                        onClick={() => setSelectedFlyerUrl(ev.flyer_url)}
                      >
                        <img
                          src={ev.flyer_url}
                          alt="Invitation Flyer"
                          className="w-full max-h-48 object-cover object-top hover:opacity-95 transition"
                        />
                        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" /> Tap to view flyer
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-serif font-bold text-lg text-slate-900 leading-snug">{ev.title}</h3>
                          {ev.deletion_requested && (
                            <span className="text-[9px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold border border-red-200">
                              Deletion Requested
                            </span>
                          )}
                        </div>

                        {/* Sabha Code is visible only to Super Admins & Organizers */}
                        {isStaff && ev.join_code && (
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <span className="text-[11px] font-mono font-bold text-[#781D26] bg-amber-50 px-2 py-0.5 rounded border border-amber-300 inline-flex items-center gap-1">
                              <KeyRound className="w-3 h-3 text-[#C56B27]" />
                              Code: {ev.join_code}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyWhatsAppInvite(ev.join_code, ev.title)}
                              className="text-[10px] font-bold text-[#C56B27] bg-white border border-[#E7DECE] hover:bg-amber-50 px-2 py-0.5 rounded inline-flex items-center gap-1 transition shadow-sm"
                              title="Copy WhatsApp Invite Link"
                            >
                              <Share2 className="w-3 h-3" /> Copy WhatsApp Invite
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Top Action Buttons (Staff Only) */}
                      {isStaff && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openQRPoster(ev)}
                            className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[#C56B27] px-2 py-1 rounded-lg text-xs font-bold transition"
                            title="Entrance QR Poster"
                          >
                            <QrCode className="w-3.5 h-3.5" /> QR
                          </button>

                          {/* Super Admin Direct Delete */}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEventPermanent(ev.event_id, ev.title)}
                              className="p-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs border border-red-200 transition"
                              title="Permanently Delete Event"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Organizer Request Deletion */}
                          {isOrganizer && !ev.deletion_requested && (
                            <button
                              type="button"
                              onClick={() => handleRequestDeletion(ev.event_id, ev.title)}
                              className="p-1 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg text-xs border border-slate-200 transition"
                              title="Request Event Deletion from Super Admin"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
                            href={`https://maps.google.com/?q=${encodeURIComponent(`${ev.venue},${ev.address}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 flex items-center gap-1 text-[10px] text-[#C56B27] hover:underline font-bold"
                          >
                            <Navigation className="w-3 h-3" /> Directions
                          </a>
                        </div>
                      )}
                    </div>

                    {/* RSVP Status / Actions */}
                    <div className="mt-4 pt-3 border-t border-[#F2ECE1]">
                      {isCompleted && !isEditing ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              RSVP Status: Completed
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                userRsvp.status === 'Yes'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : userRsvp.status === 'Maybe'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {userRsvp.status}
                            </span>
                          </div>

                          {userRsvp.status === 'Yes' && (
                            <div className="text-[10px] text-slate-600 bg-[#FAF6F0] p-2 rounded-lg border border-[#E7DECE] flex justify-between items-center">
                              <span>
                                Attendees: <strong>{userRsvp.adult_count || 1} Adult(s)</strong>
                                {userRsvp.child_count ? `, ${userRsvp.child_count} Child(ren)` : ''}
                              </span>
                              <span className="font-bold text-emerald-700">
                                Total: {(userRsvp.adult_count || 1) + (userRsvp.child_count || 0)}
                              </span>
                            </div>
                          )}

                          {userRsvp.remarks && (
                            <p className="text-[10px] italic text-slate-500 bg-white p-1.5 rounded border border-[#E7DECE]/60">
                              Note: "{userRsvp.remarks}"
                            </p>
                          )}

                          <div className="pt-1 flex items-center justify-between">
                            {lockedToday ? (
                              <p className="text-[10px] text-slate-400 italic flex items-center gap-1">
                                <Lock className="w-3 h-3" /> RSVP locked today. Modifiable starting tomorrow.
                              </p>
                            ) : (
                              <button
                                onClick={() => setEditingRsvpEventId(ev.event_id)}
                                className="text-[11px] text-[#C56B27] hover:underline font-bold flex items-center gap-1"
                              >
                                <Edit3 className="w-3 h-3" /> Change RSVP Selection
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            {isEditing ? 'Update Response' : 'RSVP'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {(['Yes', 'Maybe', 'No'] as const).map((choice) => (
                              <button
                                key={choice}
                                onClick={() => handleRSVPClick(ev, choice)}
                                className="px-3 py-1 bg-[#FAF6F0] hover:bg-[#C56B27] hover:text-white border border-[#E7DECE] rounded-lg text-xs font-semibold text-slate-700 transition"
                              >
                                {choice}
                              </button>
                            ))}
                            {isEditing && (
                              <button
                                onClick={() => setEditingRsvpEventId(null)}
                                className="text-[10px] text-slate-400 hover:text-slate-600 underline ml-1"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
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

        {/* TAB 3: MY SABHA PROFILE */}
        {activeTab === 'profile' && (
          <div className="bg-white border border-[#E7DECE] rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-[#781D26]">
              <User className="w-6 h-6 text-[#C56B27]" />
              <h2 className="text-lg font-serif font-bold">My Sabha Profile</h2>
            </div>
            <p className="text-xs text-slate-500">
              Update your personal and family member details for Sabha records.
            </p>

            {profileSaveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
                Jai Swaminarayan! Profile details saved successfully.
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="p-3 bg-[#FAF6F0] border border-[#E7DECE] rounded-xl space-y-3">
                <p className="text-xs font-bold uppercase text-[#781D26]">Personal Information</p>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. +1 416-555-0199"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Email Address (Registered)</label>
                  <input
                    type="email"
                    disabled
                    value={profile?.email || ''}
                    className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-slate-100 text-slate-500"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#FAF6F0] border border-[#E7DECE] rounded-xl space-y-3">
                <p className="text-xs font-bold uppercase text-[#781D26]">Spouse Information</p>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Spouse Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Pooja Patel"
                    value={spouseName}
                    onChange={(e) => setSpouseName(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">DOB or Age</label>
                    <input
                      type="text"
                      placeholder="e.g. 42 or YYYY-MM-DD"
                      value={spouseDobAge}
                      onChange={(e) => setSpouseDobAge(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="e.g. 416-555-0123"
                      value={spousePhone}
                      onChange={(e) => setSpousePhone(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 border rounded-lg text-xs bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#FAF6F0] border border-[#E7DECE] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs font-bold uppercase text-[#781D26]">Children ({children.length})</p>
                  <button
