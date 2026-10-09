import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { Html5QrcodeScanner } from 'html5-qrcode';
import {
  Calendar, MapPin, QrCode, CheckCircle2, HeartHandshake, ShieldCheck,
  UserCheck, LogOut, Users, Download, PlusCircle, Award, ListChecks,
  Printer, X, Navigation, Check, Loader2, User, Plus, Trash2, ChevronDown, ChevronUp,
  MessageSquare, Image as ImageIcon, UploadCloud, Edit3, Lock, Mail, BellRing,
  KeyRound, Share2, Copy, AlertTriangle, Star, UserPlus
} from 'lucide-react';

interface Child {
  name: string;
  age_dob: string;
  phone?: string;
}

const AppLogo = ({ className = "w-10 h-10" }: { className?: string }) => (
  <img
    src="./logo.png"
    alt="My Sabha Portal Logo"
    className={`${className} object-contain drop-shadow-sm`}
    onError={(e) => {
      (e.target as HTMLImageElement).src = "https://3880001.github.io/dynamic-sabha-app/logo.png";
    }}
  />
);

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'events' | 'scan' | 'profile' | 'admin'>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [unlockedEventIds, setUnlockedEventIds] = useState<Set<string>>(new Set());
  const [eventSponsors, setEventSponsors] = useState<Record<string, any[]>>({});
  const [userRsvps, setUserRsvps] = useState<Record<string, any>>({});
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [scanStatus, setScanStatus] = useState<any>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  const [showJoinCodeModal, setShowJoinCodeModal] = useState(false);
  const [inputJoinCode, setInputJoinCode] = useState('');
  const [isJoiningEvent, setIsJoiningEvent] = useState(false);

  const [sponsorGratitudeEvent, setSponsorGratitudeEvent] = useState<any | null>(null);
  const [showFamilyReminderPopup, setShowFamilyReminderPopup] = useState(false);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [spouseName, setSpouseName] = useState('');
  const [spouseDobAge, setSpouseDobAge] = useState('');
  const [spousePhone, setSpousePhone] = useState('');
  const [children, setChildren] = useState<Child[]>([]);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<any[]>([]);
  const [rsvpStats, setRsvpStats] = useState<any[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const [selectedAdminEventId, setSelectedAdminEventId] = useState<string>('');
  const [activeRosterSubTab, setActiveRosterSubTab] = useState<'completed' | 'pending_rsvp' | 'pending_checkin'>('completed');
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  const [showPendingRsvpPopup, setShowPendingRsvpPopup] = useState(false);
  const [popupEvent, setPopupEvent] = useState<any | null>(null);

  const [rsvpModalEvent, setRsvpModalEvent] = useState<any | null>(null);
  const [rsvpAdultCount, setRsvpAdultCount] = useState<number>(1);
  const [rsvpChildCount, setRsvpChildCount] = useState<number>(0);
  const [rsvpRemarks, setRsvpRemarks] = useState<string>('');
  const [editingRsvpEventId, setEditingRsvpEventId] = useState<string | null>(null);

  const [selectedFlyerUrl, setSelectedFlyerUrl] = useState<string | null>(null);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [isUploadingFlyer, setIsUploadingFlyer] = useState(false);

  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const addressWrapperRef = useRef<HTMLDivElement>(null);

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
      // ignore
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
    if (!codeToUnlock || !codeToUnlock.trim()) return;
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
        localStorage.removeItem('pending_join_code');

        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession) {
          await fetchUnlockedEvents(currentSession.user.id);
          await loadEvents();
          setActiveTab('events');
        }
      } else {
        if (showToast) alert(data?.error || 'Invalid Sabha Code.');
      }
    } catch (err: any) {
      if (showToast) alert(`Error unlocking event: ${err.message}`);
    } finally {
      setIsJoiningEvent(false);
    }
  };

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
      if (selectedAdminEventId === eventId) {
        setSelectedAdminEventId('');
      }
      loadEvents();
      loadAdminData();
    }
  };

  const handleDeleteUser = async (targetUserId: string, userName: string) => {
    if (profile?.role !== 'SUPER_ADMIN') {
      alert('Only Super Admin can delete users.');
      return;
    }

    if (targetUserId === session?.user?.id) {
      alert('You cannot delete your own Super Admin account.');
      return;
    }

    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${userName}"? This will remove their profile, RSVP records, and attendance history.`
    );
    if (!confirmDelete) return;

    try {
      const { error: rpcError } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: targetUserId,
      });

      if (rpcError) {
        const { error: deleteError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', targetUserId);

        if (deleteError) throw deleteError;
      }

      alert(`User "${userName}" has been successfully deleted.`);
      setAllUsers((prev) => prev.filter((u) => u.id !== targetUserId));
      loadAdminData();
    } catch (err: any) {
      alert(`Failed to delete user: ${err.message}`);
    }
  };

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
    }
