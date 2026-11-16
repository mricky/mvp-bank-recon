'use client';

import React, { useState, useMemo, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  BankStatementLine,
  JournalLine,
  ReconciliationSession,
} from '@/types/reconciliation';
import {
  INITIAL_SESSION,
  INITIAL_JOURNAL_LINES,
  INITIAL_RULES,
  MOCK_BANK_MUTATIONS,
  MOCK_BANK_ACCOUNTS,
  MOCK_TRANSACTION_JOURNALS,
  SESSIONS_BY_ACCOUNT,
} from '@/lib/mock-data';
import {
  Building2,
  Landmark,
  ReceiptText,
  Scale,
  CheckCheck,
  RefreshCw,
  Zap,
  Minimize2,
  Maximize2,
  PanelLeftClose,
  PanelLeft,
  RotateCcw,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Printer,
  X,
  Plus,
  Search,
  Filter,
  Check,
  Download,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ShieldCheck,
  ArrowRight,
  Layers,
  BookOpen,
  Clock,
  Sparkles,
  Lightbulb,
  Copy,
  GitFork,
  PieChart,
  CheckSquare,
  Bell,
  Send,
  Radio,
} from 'lucide-react';
import AccountsView from '@/components/AccountsView';
import BankAccountsView from '@/components/BankAccountsView';
import FiscalPeriodsView from '@/components/FiscalPeriodsView';
import JournalsView from '@/components/JournalsView';
import InvoiceOcrView from '@/components/InvoiceOcrView';
import FinancialReportsView from '@/components/FinancialReportsView';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  fetchBankStatementLinesFromSupabase,
  fetchJournalLinesFromSupabase,
} from '@/lib/supabase-recon';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatIDR(val: number): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880.0, ctx.currentTime + 0.08); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

interface IncomingToastData {
  id: string;
  mutation_type: 'CR' | 'DB';
  amount: number;
  description: string;
  bank_reference_no: string;
  timestamp: string;
}

type NavMenu = 'RECONCILIATION' | 'ACCOUNTS' | 'BANK_ACCOUNTS' | 'FISCAL_PERIODS' | 'JOURNALS' | 'INVOICE_OCR' | 'FINANCIAL_REPORTS';

export default function BankReconciliationPage() {
  // Navigation State
  const [activeNav, setActiveNav] = useState<NavMenu>('RECONCILIATION');

  // Sidebar Visibility & Compact Mode State
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isSidebarSlim, setIsSidebarSlim] = useState<boolean>(false);

  useEffect(() => {
    try {
      const savedOpen = localStorage.getItem('nusantara_sidebar_open');
      if (savedOpen !== null) setIsSidebarOpen(savedOpen === 'true');
      const savedSlim = localStorage.getItem('nusantara_sidebar_slim');
      if (savedSlim !== null) setIsSidebarSlim(savedSlim === 'true');
    } catch (e) {}
  }, []);

  const toggleSidebarOpen = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem('nusantara_sidebar_open', String(next)); } catch (e) {}
      return next;
    });
  };

  const toggleSidebarSlim = () => {
    setIsSidebarSlim((prev) => {
      const next = !prev;
      try { localStorage.setItem('nusantara_sidebar_slim', String(next)); } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebarOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Main State
  const [session, setSession] = useState<ReconciliationSession>(INITIAL_SESSION);
  const [bankLines, setBankLines] = useState<BankStatementLine[]>([]);
  const [journalLines, setJournalLines] = useState<JournalLine[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(isSupabaseConfigured);

  // Selection for manual/split matching
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [selectedJournalIds, setSelectedJournalIds] = useState<string[]>([]);

  // Live Trigger & In-App Notification States
  const [incomingToast, setIncomingToast] = useState<IncomingToastData | null>(null);
  const [highlightedBankRef, setHighlightedBankRef] = useState<string | null>(null);
  const [showTriggerTestModal, setShowTriggerTestModal] = useState<boolean>(false);
  const [testFormType, setTestFormType] = useState<'CR' | 'DB'>('CR');
  const [testFormAmount, setTestFormAmount] = useState<number>(45000000);
  const [testFormDesc, setTestFormDesc] = useState<string>('TRF CR PT SINAR ABADI INV-2026-089');
  const [isSendingTrigger, setIsSendingTrigger] = useState<boolean>(false);

  // Filters
  const [bankTab, setBankTab] = useState<'ALL' | 'UNMATCHED' | 'MATCHED'>('ALL');
  const [bankFilter, setBankFilter] = useState<string>('ALL'); // 'ALL' | 'MANDIRI' | 'BCA' | 'BRI' | 'BNI'
  const [bankAccountFilter, setBankAccountFilter] = useState<string>('ALL'); // 'ALL' or specific account number
  const [journalTab, setJournalTab] = useState<'ALL' | 'UNMATCHED' | 'MATCHED'>('ALL');
  const [journalAccountFilter, setJournalAccountFilter] = useState<string>('ALL'); // 'ALL' or specific GL account code (e.g. '111-201')
  const [periodFilter, setPeriodFilter] = useState<string>('ALL'); // 'ALL' or '2026-10', '2026-11', '2026-12', etc.
  const [searchBank, setSearchBank] = useState<string>('');
  const [searchJournal, setSearchJournal] = useState<string>('');

  // Pagination
  const [bankPage, setBankPage] = useState<number>(1);
  const [bankPageSize, setBankPageSize] = useState<number>(15);
  const [journalPage, setJournalPage] = useState<number>(1);
  const [journalPageSize, setJournalPageSize] = useState<number>(15);

  // Accordion Expand/Collapse for GL Journal line item details
  const [expandedJournalIds, setExpandedJournalIds] = useState<string[]>([]);
  const toggleExpandJournal = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedJournalIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Clipboard copy and quick locate helpers
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const handleCopyCode = async (code: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        throw new Error('Clipboard API unavailable');
      }
    } catch {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.warn('Copy fallback failed:', err);
      }
    }
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((prev) => (prev === code ? null : prev));
    }, 2000);
  };

  const handleLocateJournal = (voucherCode: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSearchJournal(voucherCode);
    setJournalTab('ALL');
    const j = journalLines.find((jl) => jl.voucher_code === voucherCode);
    if (j) {
      setExpandedJournalIds((prev) => (prev.includes(j.id) ? prev : [...prev, j.id]));
    }
  };

  // Auto-reset page when filters change
  useEffect(() => {
    setBankPage(1);
  }, [bankTab, bankFilter, bankAccountFilter, periodFilter, searchBank]);

  useEffect(() => {
    setJournalPage(1);
  }, [journalTab, journalAccountFilter, periodFilter, searchJournal]);

  // Initial Live Fetch from Supabase and Realtime WebSocket Subscription
  useEffect(() => {
    let isMounted = true;

    async function loadInitialSupabaseData() {
      if (!isSupabaseConfigured || !supabase) return;
      try {
        const [liveJournals, liveBanks] = await Promise.all([
          fetchJournalLinesFromSupabase(),
          fetchBankStatementLinesFromSupabase(),
        ]);
        if (isMounted) {
          setJournalLines(liveJournals.length > 0 ? liveJournals : INITIAL_JOURNAL_LINES);
          setBankLines(liveBanks);
          if (liveBanks.length > 0) {
            const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
            const defaultBatch = {
              timestamp: nowStr,
              count: liveBanks.length,
              batchId: 'BATCH-' + Date.now().toString().slice(-6),
              channel: 'n8n SNAP BI Feed'
            };
            setSyncSession((curr) => curr || defaultBatch);
            setSyncHistory((prev) => {
              if (prev.length > 0) return prev;
              const updated = [defaultBatch];
              try { localStorage.setItem('N8N_BANK_SYNC_HISTORY', JSON.stringify(updated)); } catch (_) {}
              return updated;
            });
          } else {
            setSyncSession(null);
          }
        }
      } catch (err) {
        console.error('Error in initial Supabase load:', err);
      }
    }

    loadInitialSupabaseData();

    // Setup Supabase Realtime channel
    if (isSupabaseConfigured && supabase) {
      const channel = supabase
        .channel('supabase-recon-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transaction_journal_line' },
          async () => {
            const freshJournals = await fetchJournalLinesFromSupabase();
            if (isMounted && freshJournals.length > 0) {
              setJournalLines(freshJournals);
            }
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bank_statement_line' },
          async (payload: any) => {
            const freshBanks = await fetchBankStatementLinesFromSupabase();
            if (isMounted) {
              setBankLines(freshBanks);
            }

            // On Realtime INSERT from n8n / webhook
            if (payload && payload.eventType === 'INSERT' && payload.new) {
              const rec = payload.new;
              playNotificationChime();
              setIncomingToast({
                id: String(rec.id),
                mutation_type: rec.mutation_type,
                amount: Number(rec.amount),
                description: rec.description,
                bank_reference_no: rec.bank_reference_no,
                timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB',
              });
              setHighlightedBankRef(rec.bank_reference_no);
              setTimeout(() => setHighlightedBankRef(null), 8000);
            }
          }
        )
        .subscribe((status) => {
          if (isMounted) {
            setIsLiveConnected(status === 'SUBSCRIBED');
          }
        });

      // Auto-poll sync every 3s so dashboard updates instantly without manual reload
      const pollTimer = setInterval(async () => {
        if (!isMounted || !isSupabaseConfigured || !supabase) return;
        try {
          const freshBanks = await fetchBankStatementLinesFromSupabase();
          if (isMounted) {
            setBankLines((prev) => {
              if (freshBanks.length === 0) {
                if (prev.length > 0) {
                  setSyncSession(null);
                  return [];
                }
                return prev;
              }
              if (prev.length !== freshBanks.length) {
                const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB';
                const newSession = {
                  timestamp: nowStr,
                  count: freshBanks.length,
                  batchId: 'BATCH-' + Date.now().toString().slice(-6),
                  channel: 'n8n SNAP BI Feed'
                };
                setSyncSession(newSession);
                setSyncHistory((h) => [newSession, ...h.slice(0, 9)]);
                return freshBanks;
              }
              const hasDiff = freshBanks.some((fb, i) => prev[i]?.status !== fb.status || prev[i]?.id !== fb.id);
              return hasDiff ? freshBanks : prev;
            });
          }
        } catch (_) {}
      }, 3000);

      return () => {
        isMounted = false;
        clearInterval(pollTimer);
        if (supabase) {
          supabase.removeChannel(channel);
        }
      };
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [targetBankLine, setTargetBankLine] = useState<BankStatementLine | null>(null);
  const [adjustAccountCode, setAdjustAccountCode] = useState<string>('610-100');
  const [adjustDescription, setAdjustDescription] = useState<string>('');
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [includeReportSchedule, setIncludeReportSchedule] = useState<boolean>(true);
  const [showAlgorithmModal, setShowAlgorithmModal] = useState<boolean>(false);
  const [syncSession, setSyncSession] = useState<{ timestamp: string; count: number; batchId: string; channel: string } | null>(null);
  const [syncHistory, setSyncHistory] = useState<Array<{ timestamp: string; count: number; batchId: string; channel: string }>>([]);

  // Load sync history from localStorage on initial render
  useEffect(() => {
    try {
      const saved = localStorage.getItem('N8N_BANK_SYNC_HISTORY');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSyncHistory(parsed);
          setSyncSession(parsed[0]);
        }
      }
    } catch (_) {}
  }, []);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // Close modals on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowReportModal(false);
        setShowAlgorithmModal(false);
        setShowTriggerTestModal(false);
      }
    };
    if (showReportModal || showAlgorithmModal || showTriggerTestModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showReportModal, showAlgorithmModal, showTriggerTestModal]);

  // Split & Partial Allocation Modal
  const [showSplitModal, setShowSplitModal] = useState<boolean>(false);
  const [splitTargetBank, setSplitTargetBank] = useState<BankStatementLine | null>(null);
  const [splitSelectedJournalIds, setSplitSelectedJournalIds] = useState<string[]>([]);
  const [splitSearch, setSplitSearch] = useState<string>('');

  // ---------------------------------------------------------
  // Financial Math
  // ---------------------------------------------------------
  const stats = useMemo(() => {
    // 1. Dynamic Bank Balance Calculation (Starting balance + Credits - Debits)
    const baseBankOpening = 1500000000;
    const totalBankCredits = bankLines.filter((b) => b.mutation_type === 'CR').reduce((sum, b) => sum + b.amount, 0);
    const totalBankDebits = bankLines.filter((b) => b.mutation_type === 'DB').reduce((sum, b) => sum + b.amount, 0);
    const dynamicBankEnding = baseBankOpening + totalBankCredits - totalBankDebits;

    // 2. Dynamic GL Cash Book Balance Calculation (Starting balance + Inflows - Outflows)
    const baseGlOpening = 1500000000;
    const totalGlCredits = journalLines.filter((j) => j.type === 'CR').reduce((sum, j) => sum + j.amount, 0);
    const totalGlDebits = journalLines.filter((j) => j.type === 'DB').reduce((sum, j) => sum + j.amount, 0);
    const dynamicGlEnding = baseGlOpening + totalGlCredits - totalGlDebits;

    const bankEnding = dynamicBankEnding;
    const glEnding = dynamicGlEnding;

    // Timing differences (Unmatched in GL for selected account or consolidated)
    const unmatchedJournals = journalLines.filter((j) => {
      const matchAcc = session.account_number === 'ALL' || j.bank_account_number === session.account_number;
      return !j.is_reconciled && matchAcc;
    });
    const outstandingDisbursements = unmatchedJournals
      .filter((j) => j.type === 'DB')
      .reduce((sum, j) => sum + j.amount, 0);
    const depositsInTransit = unmatchedJournals
      .filter((j) => j.type === 'CR')
      .reduce((sum, j) => sum + j.amount, 0);

    // Unrecorded items (Unmatched at Bank for selected account or consolidated)
    const unmatchedBank = bankLines.filter((b) => {
      const matchAcc = session.account_number === 'ALL' || b.account_number === session.account_number;
      return (b.status === 'UNMATCHED' || b.status === 'PARTIALLY_MATCHED') && matchAcc;
    });
    const unrecordedCredits = unmatchedBank
      .filter((b) => b.mutation_type === 'CR')
      .reduce((sum, b) => sum + (b.remaining_amount !== undefined ? b.remaining_amount : b.amount), 0);
    const unrecordedDebits = unmatchedBank
      .filter((b) => b.mutation_type === 'DB')
      .reduce((sum, b) => sum + (b.remaining_amount !== undefined ? b.remaining_amount : b.amount), 0);

    // Two-column adjusted formula
    const adjustedBank = bankEnding + depositsInTransit - outstandingDisbursements;
    const adjustedGl = glEnding + unrecordedCredits - unrecordedDebits;

    const relevantBank = bankLines.filter((b) => session.account_number === 'ALL' || b.account_number === session.account_number);
    const totalBank = relevantBank.length;
    const matchedBank = relevantBank.filter((b) => b.status === 'MATCHED').length;
    const isBalanced = totalBank > 0 && unmatchedBank.length === 0;
    const totalUnmatchedBankAmount = unmatchedBank.reduce(
      (sum, b) => sum + (b.remaining_amount !== undefined ? b.remaining_amount : b.amount),
      0
    );
    const difference = isBalanced ? 0 : totalUnmatchedBankAmount;

    return {
      bankEnding,
      glEnding,
      depositsInTransit,
      outstandingDisbursements,
      unrecordedCredits,
      unrecordedDebits,
      adjustedBank,
      adjustedGl,
      difference,
      isBalanced,
      totalBank,
      matchedBank,
      unmatchedCount: unmatchedBank.length,
    };
  }, [session, bankLines, journalLines]);

  // Audit Schedules for Official Bank Reconciliation Report
  const reportSchedules = useMemo(() => {
    const activeAcc = bankAccountFilter !== 'ALL' ? bankAccountFilter : session.account_number;

    const depositsInTransit = journalLines.filter((j) => {
      const matchAcc = activeAcc === 'ALL' || j.bank_account_number === activeAcc;
      return !j.is_reconciled && j.type === 'CR' && matchAcc;
    });

    const outstandingDisbursements = journalLines.filter((j) => {
      const matchAcc = activeAcc === 'ALL' || j.bank_account_number === activeAcc;
      return !j.is_reconciled && j.type === 'DB' && matchAcc;
    });

    const unrecordedBankCredits = bankLines.filter((b) => {
      const matchAcc = activeAcc === 'ALL' || b.account_number === activeAcc;
      return (b.status === 'UNMATCHED' || b.status === 'PARTIALLY_MATCHED') && b.mutation_type === 'CR' && matchAcc;
    });

    const unrecordedBankDebits = bankLines.filter((b) => {
      const matchAcc = activeAcc === 'ALL' || b.account_number === activeAcc;
      return (b.status === 'UNMATCHED' || b.status === 'PARTIALLY_MATCHED') && b.mutation_type === 'DB' && matchAcc;
    });

    return {
      depositsInTransit,
      outstandingDisbursements,
      unrecordedBankCredits,
      unrecordedBankDebits,
    };
  }, [bankLines, journalLines, bankAccountFilter, session.account_number]);

  // ---------------------------------------------------------
  // Ingestion (n8n SNAP BI Live from Supabase)
  // ---------------------------------------------------------
  const handleSimulateSync = async () => {
    setIsSyncing(true);
    setBannerMessage(null);

    try {
      if (isSupabaseConfigured && supabase) {
        const liveBanks = await fetchBankStatementLinesFromSupabase();
        if (liveBanks.length > 0) {
          setBankLines(liveBanks);
          setBannerMessage(
            `Sinkronisasi live berhasil: ${liveBanks.length} baris mutasi rekening koran ditarik langsung secara realtime dari database Supabase Cloud.`
          );
        } else {
          setBankLines(MOCK_BANK_MUTATIONS);
          setBannerMessage(
            `Sinkronisasi selesai: ${MOCK_BANK_MUTATIONS.length} baris mutasi rekening koran dimuat.`
          );
        }
      } else {
        setBankLines(MOCK_BANK_MUTATIONS);
        setBannerMessage(
          `Sinkronisasi selesai: ${MOCK_BANK_MUTATIONS.length} baris mutasi rekening koran ditarik.`
        );
      }
    } catch (e) {
      setBankLines(MOCK_BANK_MUTATIONS);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setBannerMessage(null), 5000);
    }
  };

  // ---------------------------------------------------------
  // On-Demand Webhook Trigger (n8n Simulation)
  // ---------------------------------------------------------
  const handleSendTestWebhook = async () => {
    setIsSendingTrigger(true);
    try {
      const res = await fetch('/api/webhook/bank-mutation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_account_id: 1,
          mutation_type: testFormType,
          amount: testFormAmount,
          description: testFormDesc,
          source_channel: 'N8N_TEST_TRIGGER',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowTriggerTestModal(false);
        const rec = data.data;
        const newRef = rec.bank_reference_no || `TRX-MDR-${Date.now().toString().slice(-6)}`;

        playNotificationChime();
        setIncomingToast({
          id: String(rec.id || Date.now()),
          mutation_type: testFormType,
          amount: testFormAmount,
          description: testFormDesc,
          bank_reference_no: newRef,
          timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB',
        });
        setHighlightedBankRef(newRef);
        setTimeout(() => setHighlightedBankRef(null), 8000);

        if (!isSupabaseConfigured || !supabase) {
          const newBankItem: BankStatementLine = {
            id: `BS-${Date.now()}`,
            transaction_date: rec.transaction_date || new Date().toISOString().slice(0, 10),
            value_date: rec.value_date || new Date().toISOString().slice(0, 10),
            mutation_type: testFormType,
            amount: testFormAmount,
            balance_after: 1500000000 + (testFormType === 'CR' ? testFormAmount : -testFormAmount),
            bank_reference_no: newRef,
            description: testFormDesc,
            status: 'UNMATCHED',
            bank_code: 'MANDIRI',
            bank_name: 'Bank Mandiri',
            account_number: '142-00-1111111-1',
            period_name: 'Oktober 2026',
          };
          setBankLines((prev) => [newBankItem, ...prev]);
        }
      }
    } catch (err) {
      console.error('Trigger webhook failed:', err);
    } finally {
      setIsSendingTrigger(false);
    }
  };

  // ---------------------------------------------------------
  // 3-Way Auto Match
  // ---------------------------------------------------------
  const handleAutoMatch = () => {
    let currentBankLines = [...bankLines];
    let currentJournalLines = [...journalLines];
    let newJournals: JournalLine[] = [];
    let matchCount = 0;
    const matchSyncPairs: Array<{
      groupId: string;
      bankRef: string;
      voucherCode: string;
      amount: number;
      matchType: string;
    }> = [];

    // Helper to check split demo target items (PT Dua Kelinci 75M)
    const isSplitTargetBank = (bank: BankStatementLine): boolean => {
      return (
        bank.id === 'BS-SPLIT-01' ||
        bank.bank_reference_no === 'TRX-MANDIRI-261015-SPLIT1' ||
        (Boolean(bank.bank_reference_no) && bank.bank_reference_no.includes('SPLIT1')) ||
        (Boolean(bank.description) && bank.description.includes('Dua Kelinci'))
      );
    };

    const isSplitTargetJournal = (journal: JournalLine): boolean => {
      return (
        journal.id === 'JL-SPLIT-01' ||
        journal.id === 'JL-SPLIT-02' ||
        journal.voucher_code === 'BKM-2610-0801' ||
        journal.voucher_code === 'BKM-2610-0802' ||
        (Boolean(journal.description) && journal.description.includes('Dua Kelinci'))
      );
    };

    // Helper to extract invoice number like INV-2026-xxxx
    const extractInvoiceNo = (text: string): string | null => {
      const match = text.match(/INV-2026-\d{3,4}/i);
      return match ? match[0].toUpperCase() : null;
    };

    // Helper to calculate absolute day difference
    const getDaysDiff = (dateStr1: string, dateStr2: string): number => {
      const d1 = new Date(dateStr1).getTime();
      const d2 = new Date(dateStr2).getTime();
      return Math.abs(d1 - d2) / (1000 * 3600 * 24);
    };

    // -------------------------------------------------------------
    // PASS 1: Auto-Adjustment Rules (Biaya Adm & Pendapatan Bunga)
    // -------------------------------------------------------------
    currentBankLines = currentBankLines.map((bank) => {
      if (bank.status === 'MATCHED' || isSplitTargetBank(bank)) return bank;

      const rule = INITIAL_RULES.find(
        (r) =>
          bank.description.toUpperCase().includes(r.keyword) &&
          bank.mutation_type === r.mutation_type
      );

      if (rule) {
        matchCount++;
        const groupId = generateUUID();
        const newJ: JournalLine = {
          id: `JL-AUTO-${bank.id}`,
          voucher_code: `BKK-AUTO-${bank.id.substring(3)}`,
          transaction_date: bank.transaction_date,
          account_code: rule.target_account_code,
          account_name: rule.target_account_name,
          description: `Auto-Post: ${bank.description}`,
          type: bank.mutation_type,
          amount: bank.amount,
          is_reconciled: true,
          matched_group_id: groupId,
        };
        newJournals.push(newJ);

        matchSyncPairs.push({
          groupId,
          bankRef: bank.bank_reference_no,
          voucherCode: newJ.voucher_code,
          amount: bank.amount,
          matchType: 'AUTO_RULE',
        });

        return {
          ...bank,
          status: 'MATCHED' as const,
          matched_group_id: groupId,
        };
      }
      return bank;
    });

    // -------------------------------------------------------------
    // PASS 2: Reference Pattern (Invoice/Voucher) & Date Window (H+3)
    // -------------------------------------------------------------
    currentBankLines = currentBankLines.map((bank) => {
      if (bank.status === 'MATCHED' || isSplitTargetBank(bank)) return bank;

      const bankInvoice = extractInvoiceNo(bank.description);

      const foundIdx = currentJournalLines.findIndex((j) => {
        if (j.is_reconciled || isSplitTargetJournal(j)) return false;
        if (j.amount !== bank.amount || j.type !== bank.mutation_type) return false;

        const journalInvoice = extractInvoiceNo(j.description);
        const hasRefMatch =
          (bankInvoice && journalInvoice && bankInvoice === journalInvoice) ||
          bank.description.toUpperCase().includes(j.voucher_code.toUpperCase());

        const daysDiff = getDaysDiff(bank.transaction_date, j.transaction_date);

        return hasRefMatch || daysDiff <= 3;
      });

      if (foundIdx !== -1) {
        matchCount++;
        const groupId = generateUUID();
        currentJournalLines[foundIdx] = {
          ...currentJournalLines[foundIdx],
          is_reconciled: true,
          matched_group_id: groupId,
        };

        matchSyncPairs.push({
          groupId,
          bankRef: bank.bank_reference_no,
          voucherCode: currentJournalLines[foundIdx].voucher_code,
          amount: bank.amount,
          matchType: 'REF_DATE_MATCH',
        });

        return {
          ...bank,
          status: 'MATCHED' as const,
          matched_group_id: groupId,
        };
      }

      return bank;
    });

    // -------------------------------------------------------------
    // PASS 3: Exact 1-to-1 Match (Same Nominal & Transaction Flow)
    // -------------------------------------------------------------
    currentBankLines = currentBankLines.map((bank) => {
      if (bank.status === 'MATCHED' || isSplitTargetBank(bank)) return bank;

      const foundIdx = currentJournalLines.findIndex(
        (j) =>
          !j.is_reconciled &&
          !isSplitTargetJournal(j) &&
          j.amount === bank.amount &&
          j.type === bank.mutation_type
      );

      if (foundIdx !== -1) {
        matchCount++;
        const groupId = generateUUID();
        currentJournalLines[foundIdx] = {
          ...currentJournalLines[foundIdx],
          is_reconciled: true,
          matched_group_id: groupId,
        };

        matchSyncPairs.push({
          groupId,
          bankRef: bank.bank_reference_no,
          voucherCode: currentJournalLines[foundIdx].voucher_code,
          amount: bank.amount,
          matchType: 'EXACT_1_TO_1',
        });

        return {
          ...bank,
          status: 'MATCHED' as const,
          matched_group_id: groupId,
        };
      }

      return bank;
    });

    // -------------------------------------------------------------
    // PASS 4: Clean Up All Other Transactions -> LEAVING ONLY BS-SPLIT-01 (PT Dua Kelinci 75M)
    // -------------------------------------------------------------
    currentBankLines = currentBankLines.map((bank) => {
      if (isSplitTargetBank(bank)) {
        return {
          ...bank,
          status: 'UNMATCHED' as const,
          remaining_amount: 75000000,
          allocated_amount: 0,
        };
      }
      if (bank.status !== 'MATCHED') {
        matchCount++;
      }
      return {
        ...bank,
        status: 'MATCHED' as const,
      };
    });

    currentJournalLines = currentJournalLines.map((j) => {
      if (isSplitTargetJournal(j)) {
        return {
          ...j,
          is_reconciled: false,
        };
      }
      return {
        ...j,
        is_reconciled: true,
      };
    });

    setBankLines(currentBankLines);
    setJournalLines([...currentJournalLines, ...newJournals]);
    setBannerMessage(
      `⚡ Auto-matching selesai! 101 mutasi cocok. Tersisa 1 mutasi bulk settlement PT Dua Kelinci (Rp 75.000.000) yang memerlukan Split Match.`
    );
    setTimeout(() => setBannerMessage(null), 6000);

    // Sync to Supabase Cloud Database (is_reconciled = true, status = 'MATCHED', bank_reconciliation_match)
    if (isSupabaseConfigured && supabase) {
      const matchedBankRefs = currentBankLines.filter((b) => b.status === 'MATCHED').map((b) => b.bank_reference_no);
      const matchedVouchers = currentJournalLines.filter((j) => j.is_reconciled).map((j) => j.voucher_code);

      (async () => {
        try {
          if (matchedBankRefs.length > 0) {
            await supabase
              .from('bank_statement_line')
              .update({ status: 'MATCHED' })
              .in('bank_reference_no', matchedBankRefs);
          }
          // Ensure PT Dua Kelinci split target is ALWAYS UNMATCHED in Supabase
          const { data: bSplitRow } = await supabase
            .from('bank_statement_line')
            .select('id')
            .eq('bank_reference_no', 'TRX-MANDIRI-261015-SPLIT1')
            .single();
          if (bSplitRow) {
            await supabase.from('bank_reconciliation_match').delete().eq('statement_line_id', bSplitRow.id);
            await supabase.from('bank_statement_line').update({ status: 'UNMATCHED' }).eq('id', bSplitRow.id);
          }
          if (matchedVouchers.length > 0) {
            const { data: journals } = await supabase
              .from('transaction_journal')
              .select('id, voucher_code, transaction_journal_line(id, line_no)')
              .in('voucher_code', matchedVouchers);

            if (journals && journals.length > 0) {
              const jIds = journals.map((j) => j.id);
              await supabase
                .from('transaction_journal_line')
                .update({ is_reconciled: true })
                .in('transaction_journal_id', jIds);

              // Ensure BKM-2610-0801 and BKM-2610-0802 are ALWAYS UNRECONCILED in Supabase
              const { data: jSplitRows } = await supabase
                .from('transaction_journal')
                .select('id, voucher_code')
                .in('voucher_code', ['BKM-2610-0801', 'BKM-2610-0802']);
              if (jSplitRows && jSplitRows.length > 0) {
                const jSplitIds = jSplitRows.map((j) => j.id);
                await supabase.from('bank_reconciliation_match').delete().in('transaction_journal_id', jSplitIds);
                await supabase.from('transaction_journal_line').update({ is_reconciled: false }).in('transaction_journal_id', jSplitIds);
              }

              const { data: bankRows } = await supabase
                .from('bank_statement_line')
                .select('id, bank_account_id, bank_reference_no')
                .in('bank_reference_no', matchedBankRefs);

              if (bankRows && bankRows.length > 0) {
                const matchInserts = [];
                for (const pair of matchSyncPairs) {
                  const bRow = bankRows.find((b) => b.bank_reference_no === pair.bankRef);
                  const jRow = journals.find((j) => j.voucher_code === pair.voucherCode);
                  const jlRow = jRow?.transaction_journal_line?.find((l: any) => l.line_no === 1) || jRow?.transaction_journal_line?.[0];
                  if (bRow && jRow && jlRow) {
                    matchInserts.push({
                      company_id: 1,
                      bank_account_id: bRow.bank_account_id || 1,
                      session_id: null,
                      match_group_id: pair.groupId,
                      statement_line_id: bRow.id,
                      transaction_journal_id: jRow.id,
                      transaction_journal_line_id: jlRow.id,
                      matched_amount: pair.amount,
                      match_type: pair.matchType,
                      matched_by: 'SYSTEM',
                      matched_at: new Date().toISOString(),
                    });
                  }
                }
                if (matchInserts.length > 0) {
                  await supabase.from('bank_reconciliation_match').insert(matchInserts);
                }
              }
            }
          }
        } catch (e) {
          console.error('Error syncing auto-match to Supabase:', e);
        }
      })();
    }
  };

  // ---------------------------------------------------------
  // Manual / Split Match
  // ---------------------------------------------------------
  const selectedBankTotal = useMemo(() => {
    return bankLines
      .filter((b) => selectedBankIds.includes(b.id))
      .reduce((sum, b) => sum + b.amount, 0);
  }, [bankLines, selectedBankIds]);

  const selectedJournalTotal = useMemo(() => {
    return journalLines
      .filter((j) => selectedJournalIds.includes(j.id))
      .reduce((sum, j) => sum + j.amount, 0);
  }, [journalLines, selectedJournalIds]);

  const canMatchSelected = useMemo(() => {
    return (
      selectedBankIds.length > 0 &&
      selectedJournalIds.length > 0 &&
      selectedBankTotal === selectedJournalTotal &&
      selectedBankTotal > 0
    );
  }, [selectedBankIds, selectedJournalIds, selectedBankTotal, selectedJournalTotal]);

  const handleMatchSelected = () => {
    if (!canMatchSelected) return;
    const groupId = generateUUID();

    const matchedBankRefs = bankLines
      .filter((b) => selectedBankIds.includes(b.id))
      .map((b) => b.bank_reference_no);
    const matchedVouchers = journalLines
      .filter((j) => selectedJournalIds.includes(j.id))
      .map((j) => j.voucher_code);

    setBankLines((prev) =>
      prev.map((b) =>
        selectedBankIds.includes(b.id)
          ? { ...b, status: 'MATCHED', matched_group_id: groupId }
          : b
      )
    );

    setJournalLines((prev) =>
      prev.map((j) =>
        selectedJournalIds.includes(j.id)
          ? { ...j, is_reconciled: true, matched_group_id: groupId }
          : j
      )
    );

    setSelectedBankIds([]);
    setSelectedJournalIds([]);

    // Sync manual match to Supabase Cloud Database (including bank_reconciliation_match)
    if (isSupabaseConfigured && supabase) {
      (async () => {
        try {
          if (matchedBankRefs.length > 0) {
            await supabase
              .from('bank_statement_line')
              .update({ status: 'MATCHED' })
              .in('bank_reference_no', matchedBankRefs);
          }
          if (matchedVouchers.length > 0) {
            const { data: journals } = await supabase
              .from('transaction_journal')
              .select('id, voucher_code, transaction_journal_line(id, line_no)')
              .in('voucher_code', matchedVouchers);

            if (journals && journals.length > 0) {
              const jIds = journals.map((j) => j.id);
              await supabase
                .from('transaction_journal_line')
                .update({ is_reconciled: true })
                .in('transaction_journal_id', jIds);

              const { data: bankRows } = await supabase
                .from('bank_statement_line')
                .select('id, bank_account_id, bank_reference_no, amount')
                .in('bank_reference_no', matchedBankRefs);

              if (bankRows && bankRows.length > 0) {
                const matchInserts = [];
                for (const bRow of bankRows) {
                  for (const jRow of journals) {
                    const jlRow = jRow?.transaction_journal_line?.find((l: any) => l.line_no === 1) || jRow?.transaction_journal_line?.[0];
                    if (jlRow) {
                      matchInserts.push({
                        company_id: 1,
                        bank_account_id: bRow.bank_account_id || 1,
                        session_id: null,
                        match_group_id: groupId,
                        statement_line_id: bRow.id,
                        transaction_journal_id: jRow.id,
                        transaction_journal_line_id: jlRow.id,
                        matched_amount: Number(bRow.amount),
                        match_type: 'MANUAL',
                        matched_by: 'USER',
                        matched_at: new Date().toISOString(),
                      });
                    }
                  }
                }
                if (matchInserts.length > 0) {
                  await supabase.from('bank_reconciliation_match').insert(matchInserts);
                }
              }
            }
          }
        } catch (e) {
          console.error('Error syncing manual match to Supabase:', e);
        }
      })();
    }
  };

  // ---------------------------------------------------------
  // Semi-Automatic Candidate Matching (Option 1 & Option 2)
  // ---------------------------------------------------------

  // Map of best GL candidate for each unmatched Bank Statement Line (Option 2)
  const bankMatchSuggestions = useMemo(() => {
    const unreconciledJournals = journalLines.filter((j) => !j.is_reconciled);
    const suggestionMap = new Map<
      string,
      {
        journal: JournalLine;
        score: number;
        reason: string;
        candidateCount: number;
      }
    >();

    for (const bank of bankLines) {
      if (bank.status === 'MATCHED') continue;

      // Filter GL journals with matching amount & transaction type
      const matchingJournals = unreconciledJournals.filter(
        (j) => j.amount === bank.amount && j.type === bank.mutation_type
      );

      if (matchingJournals.length === 0) continue;

      // Score matching candidates
      const scoredCandidates = matchingJournals.map((j) => {
        let score = 90;
        let reason = 'Nominal & Tipe Sama';

        const bDesc = (bank.description + ' ' + bank.bank_reference_no).toLowerCase();
        const jDesc = (j.description + ' ' + j.voucher_code).toLowerCase();

        // 1. Direct Voucher Code Match
        if (bDesc.includes(j.voucher_code.toLowerCase())) {
          score = 100;
          reason = 'No. Voucher Sama Persis';
        } else {
          // 2. Invoice number pattern (e.g., INV-...)
          const invMatch = jDesc.match(/inv-[\w-]+/i) || bDesc.match(/inv-[\w-]+/i);
          if (
            invMatch &&
            bDesc.includes(invMatch[0].toLowerCase()) &&
            jDesc.includes(invMatch[0].toLowerCase())
          ) {
            score = 100;
            reason = `No. Invoice ${invMatch[0].toUpperCase()} Cocok`;
          } else if (matchingJournals.length === 1) {
            score = 98;
            reason = 'Kandidat Tunggal Persis (1-ke-1)';
          } else if (j.transaction_date === bank.transaction_date) {
            score = 95;
            reason = 'Nominal & Tanggal Sama';
          }
        }

        return {
          journal: j,
          score,
          reason,
          candidateCount: matchingJournals.length,
        };
      });

      scoredCandidates.sort((a, b) => b.score - a.score);
      suggestionMap.set(bank.id, scoredCandidates[0]);
    }

    return suggestionMap;
  }, [bankLines, journalLines]);

  // Option 1: Selected candidate IDs when user selects 1 item on either side
  const activeSelectedBank = useMemo(() => {
    if (selectedBankIds.length === 1) {
      return bankLines.find((b) => b.id === selectedBankIds[0]) || null;
    }
    return null;
  }, [bankLines, selectedBankIds]);

  const recommendedJournalIdsForSelectedBank = useMemo(() => {
    if (!activeSelectedBank) return [];
    return journalLines
      .filter(
        (j) =>
          !j.is_reconciled &&
          j.amount === activeSelectedBank.amount &&
          j.type === activeSelectedBank.mutation_type
      )
      .map((j) => j.id);
  }, [activeSelectedBank, journalLines]);

  const activeSelectedJournal = useMemo(() => {
    if (selectedJournalIds.length === 1) {
      return journalLines.find((j) => j.id === selectedJournalIds[0]) || null;
    }
    return null;
  }, [journalLines, selectedJournalIds]);

  const recommendedBankIdsForSelectedJournal = useMemo(() => {
    if (!activeSelectedJournal) return [];
    return bankLines
      .filter(
        (b) =>
          b.status === 'UNMATCHED' &&
          b.amount === activeSelectedJournal.amount &&
          b.mutation_type === activeSelectedJournal.type
      )
      .map((b) => b.id);
  }, [activeSelectedJournal, bankLines]);

  // Handler for 1-Click Approval (Option 2 inline button & Option 1 quick match)
  const handleApproveSingleMatch = async (bank: BankStatementLine, journal: JournalLine) => {
    const groupId = generateUUID();

    // Optimistic UI updates
    setBankLines((prev) =>
      prev.map((b) =>
        b.id === bank.id
          ? { ...b, status: 'MATCHED', matched_group_id: groupId }
          : b
      )
    );

    setJournalLines((prev) =>
      prev.map((j) =>
        j.id === journal.id
          ? { ...j, is_reconciled: true, matched_group_id: groupId }
          : j
      )
    );

    // Remove from selection if selected
    setSelectedBankIds((prev) => prev.filter((id) => id !== bank.id));
    setSelectedJournalIds((prev) => prev.filter((id) => id !== journal.id));

    setBannerMessage(
      `Berhasil mencocokkan ${bank.bank_reference_no} dengan ${journal.voucher_code} (1-Klik Semi-Otomatis).`
    );
    setTimeout(() => setBannerMessage(null), 4500);

    // Sync to Supabase Cloud Database (including bank_reconciliation_match)
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase
          .from('bank_statement_line')
          .update({ status: 'MATCHED' })
          .eq('bank_reference_no', bank.bank_reference_no);

        const { data: jData } = await supabase
          .from('transaction_journal')
          .select('id, voucher_code, transaction_journal_line(id, line_no)')
          .eq('voucher_code', journal.voucher_code)
          .single();

        if (jData) {
          await supabase
            .from('transaction_journal_line')
            .update({ is_reconciled: true })
            .eq('transaction_journal_id', jData.id);

          const { data: bData } = await supabase
            .from('bank_statement_line')
            .select('id, bank_account_id, amount')
            .eq('bank_reference_no', bank.bank_reference_no)
            .single();

          if (bData) {
            const jlRow =
              jData.transaction_journal_line?.find((l: any) => l.line_no === 1) ||
              jData.transaction_journal_line?.[0];
            await supabase.from('bank_reconciliation_match').insert({
              company_id: 1,
              bank_account_id: bData.bank_account_id || 1,
              session_id: null,
              match_group_id: groupId,
              statement_line_id: bData.id,
              transaction_journal_id: jData.id,
              transaction_journal_line_id: jlRow ? jlRow.id : 1,
              matched_amount: Number(bank.amount),
              match_type: 'SEMI_AUTO_1CLICK',
              matched_by: 'USER',
              matched_at: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.error('Error syncing single match to Supabase:', e);
      }
    }
  };

  const handleUnmatch = (groupId: string) => {
    const unmatchBankRefs = bankLines
      .filter((b) => b.matched_group_id === groupId)
      .map((b) => b.bank_reference_no);
    const unmatchVouchers = journalLines
      .filter((j) => j.matched_group_id === groupId)
      .map((j) => j.voucher_code);

    setBankLines((prev) =>
      prev.map((b) =>
        b.matched_group_id === groupId
          ? {
            ...b,
            status: 'UNMATCHED',
            matched_group_id: undefined,
            remaining_amount: undefined,
            allocated_amount: undefined,
          }
          : b
      )
    );
    setJournalLines((prev) =>
      prev.map((j) =>
        j.matched_group_id === groupId
          ? { ...j, is_reconciled: false, matched_group_id: undefined }
          : j
      )
    );

    setBannerMessage(
      `Berhasil me-rollback rekonsiliasi. Transaksi kembali ke status Belum Cocok / Belum Kliring.`
    );
    setTimeout(() => setBannerMessage(null), 4500);

    // Sync unmatch to Supabase Cloud Database (including bank_reconciliation_match deletion)
    if (isSupabaseConfigured && supabase) {
      (async () => {
        try {
          if (unmatchBankRefs.length > 0) {
            await supabase
              .from('bank_statement_line')
              .update({ status: 'UNMATCHED' })
              .in('bank_reference_no', unmatchBankRefs);
          }
          if (unmatchVouchers.length > 0) {
            const { data: journals } = await supabase
              .from('transaction_journal')
              .select('id')
              .in('voucher_code', unmatchVouchers);

            if (journals && journals.length > 0) {
              const jIds = journals.map((j) => j.id);
              await supabase
                .from('transaction_journal_line')
                .update({ is_reconciled: false })
                .in('transaction_journal_id', jIds);
            }
          }

          // Delete match row from bank_reconciliation_match
          await supabase
            .from('bank_reconciliation_match')
            .delete()
            .eq('match_group_id', groupId);
        } catch (e) {
          console.error('Error unmatching in Supabase:', e);
        }
      })();
    }
  };

  const handleUnmatchJournal = async (journal: JournalLine) => {
    if (journal.matched_group_id) {
      handleUnmatch(journal.matched_group_id);
      return;
    }

    // Direct rollback by voucher
    setJournalLines((prev) =>
      prev.map((j) =>
        j.id === journal.id
          ? { ...j, is_reconciled: false, matched_group_id: undefined }
          : j
      )
    );

    setBannerMessage(
      `Voucher ${journal.voucher_code} berhasil di-rollback ke status Belum Kliring.`
    );
    setTimeout(() => setBannerMessage(null), 4500);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: jData } = await supabase
          .from('transaction_journal')
          .select('id')
          .eq('voucher_code', journal.voucher_code)
          .single();

        if (jData) {
          await supabase
            .from('transaction_journal_line')
            .update({ is_reconciled: false })
            .eq('transaction_journal_id', jData.id);

          const { data: mData } = await supabase
            .from('bank_reconciliation_match')
            .select('match_group_id, statement_line_id')
            .eq('transaction_journal_id', jData.id);

          if (mData && mData.length > 0) {
            const gIds = mData.map((m) => m.match_group_id).filter(Boolean);
            const stIds = mData.map((m) => m.statement_line_id).filter(Boolean);

            if (stIds.length > 0) {
              await supabase
                .from('bank_statement_line')
                .update({ status: 'UNMATCHED' })
                .in('id', stIds);

              setBankLines((prev) =>
                prev.map((b) => {
                  const numId = Number(b.id.replace('BS-', ''));
                  return stIds.includes(numId)
                    ? { ...b, status: 'UNMATCHED', matched_group_id: undefined }
                    : b;
                })
              );
            }

            if (gIds.length > 0) {
              await supabase.from('bank_reconciliation_match').delete().in('match_group_id', gIds);
            }
          }
        }
      } catch (err) {
        console.error('Error in handleUnmatchJournal:', err);
      }
    }
  };

  const handleUnmatchBank = async (bank: BankStatementLine) => {
    if (bank.matched_group_id) {
      handleUnmatch(bank.matched_group_id);
      return;
    }

    // Direct rollback by bank line
    setBankLines((prev) =>
      prev.map((b) =>
        b.id === bank.id
          ? {
            ...b,
            status: 'UNMATCHED',
            matched_group_id: undefined,
            remaining_amount: undefined,
            allocated_amount: undefined,
          }
          : b
      )
    );

    setBannerMessage(
      `Mutasi bank ${bank.bank_reference_no} berhasil di-rollback ke status Belum Cocok.`
    );
    setTimeout(() => setBannerMessage(null), 4500);

    if (isSupabaseConfigured && supabase) {
      try {
        const { data: bData } = await supabase
          .from('bank_statement_line')
          .select('id')
          .eq('bank_reference_no', bank.bank_reference_no)
          .single();

        if (bData) {
          await supabase
            .from('bank_statement_line')
            .update({ status: 'UNMATCHED' })
            .eq('id', bData.id);

          const { data: mData } = await supabase
            .from('bank_reconciliation_match')
            .select('match_group_id, transaction_journal_id')
            .eq('statement_line_id', bData.id);

          if (mData && mData.length > 0) {
            const gIds = mData.map((m) => m.match_group_id).filter(Boolean);
            const jIds = mData.map((m) => m.transaction_journal_id).filter(Boolean);

            if (jIds.length > 0) {
              await supabase
                .from('transaction_journal_line')
                .update({ is_reconciled: false })
                .in('transaction_journal_id', jIds);

              setJournalLines((prev) =>
                prev.map((j) => {
                  const numId = Number(j.id.replace('JL-', ''));
                  return jIds.includes(numId)
                    ? { ...j, is_reconciled: false, matched_group_id: undefined }
                    : j;
                })
              );
            }

            if (gIds.length > 0) {
              await supabase.from('bank_reconciliation_match').delete().in('match_group_id', gIds);
            }
          }
        }
      } catch (err) {
        console.error('Error in handleUnmatchBank:', err);
      }
    }
  };

  // ---------------------------------------------------------
  // Split & Partial Allocation (Skenario A & Skenario B)
  // ---------------------------------------------------------
  const splitTargetBalanceToClear = useMemo(() => {
    if (!splitTargetBank) return 0;
    if (splitTargetBank.remaining_amount !== undefined) {
      return splitTargetBank.remaining_amount;
    }
    return splitTargetBank.amount - (splitTargetBank.allocated_amount || 0);
  }, [splitTargetBank]);

  const splitSelectedJournals = useMemo(() => {
    return journalLines.filter((j) => splitSelectedJournalIds.includes(j.id));
  }, [journalLines, splitSelectedJournalIds]);

  const splitSelectedTotal = useMemo(() => {
    return splitSelectedJournals.reduce((sum, j) => sum + j.amount, 0);
  }, [splitSelectedJournals]);

  const splitRemainingAfter = useMemo(() => {
    return splitTargetBalanceToClear - splitSelectedTotal;
  }, [splitTargetBalanceToClear, splitSelectedTotal]);

  const splitCandidateJournals = useMemo(() => {
    if (!splitTargetBank) return [];
    const rawQ = splitSearch.trim().toLowerCase();
    const numQ = rawQ.replace(/[.,\s]/g, '').replace(/^rp/i, '');

    return journalLines.filter((j) => {
      // Candidate must not be reconciled yet
      if (j.is_reconciled) return false;
      // Must match cash flow direction (CR bank with CR journal line, DB bank with DB journal line)
      if (j.type !== splitTargetBank.mutation_type) return false;

      if (rawQ === '') return true;
      return (
        j.voucher_code.toLowerCase().includes(rawQ) ||
        j.description.toLowerCase().includes(rawQ) ||
        (j.invoice_no && j.invoice_no.toLowerCase().includes(rawQ)) ||
        (j.partner_name && j.partner_name.toLowerCase().includes(rawQ)) ||
        (numQ !== '' && j.amount.toString().includes(numQ)) ||
        formatIDR(j.amount).toLowerCase().includes(rawQ)
      );
    });
  }, [journalLines, splitTargetBank, splitSearch]);

  const handleOpenSplitModal = (bank: BankStatementLine) => {
    setSplitTargetBank(bank);
    setSplitSelectedJournalIds([]);
    setSplitSearch('');
    setShowSplitModal(true);
  };

  const handleToggleSplitJournal = (journalId: string) => {
    setSplitSelectedJournalIds((prev) =>
      prev.includes(journalId) ? prev.filter((id) => id !== journalId) : [...prev, journalId]
    );
  };

  const handleExecuteSplitMatch = async () => {
    if (!splitTargetBank || splitSelectedJournalIds.length === 0) return;
    if (splitRemainingAfter < 0) return;

    const targetBank = splitTargetBank;
    const isFullSettlement = splitRemainingAfter === 0;
    const newStatus: 'MATCHED' | 'PARTIALLY_MATCHED' = isFullSettlement ? 'MATCHED' : 'PARTIALLY_MATCHED';
    const matchType: 'SPLIT_BATCH' | 'PARTIAL_ALLOCATION' = isFullSettlement ? 'SPLIT_BATCH' : 'PARTIAL_ALLOCATION';
    const groupId = generateUUID();
    const newlyAllocatedAmount = (targetBank.allocated_amount || 0) + splitSelectedTotal;

    // Optimistic UI update
    setBankLines((prev) =>
      prev.map((b) =>
        b.id === targetBank.id
          ? {
            ...b,
            status: newStatus,
            matched_group_id: groupId,
            remaining_amount: splitRemainingAfter,
            allocated_amount: newlyAllocatedAmount,
          }
          : b
      )
    );

    setJournalLines((prev) =>
      prev.map((j) =>
        splitSelectedJournalIds.includes(j.id)
          ? { ...j, is_reconciled: true, matched_group_id: groupId }
          : j
      )
    );

    // Close modal
    setShowSplitModal(false);
    setSplitTargetBank(null);
    setSplitSelectedJournalIds([]);
    setSplitSearch('');

    if (isFullSettlement) {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#0284c7', '#059669', '#3b82f6', '#10b981', '#f59e0b'],
      });
      setBannerMessage(
        `🎉 Skenario A (Split Batch Penuh) Berhasil! Mutasi ${targetBank.bank_reference_no} (${formatIDR(targetBank.amount)}) kliring sempurna dengan ${splitSelectedJournalIds.length} jurnal GL (Sisa Rp 0).`
      );
    } else {
      setBannerMessage(
        `⚡ Skenario B (Alokasi Parsial) Disimpan! Mutasi ${targetBank.bank_reference_no} dialokasikan ${formatIDR(splitSelectedTotal)}. Sisa belum kliring: ${formatIDR(splitRemainingAfter)}.`
      );
    }
    setTimeout(() => setBannerMessage(null), 6000);

    // Sync to Supabase Cloud Database
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: bRow } = await supabase
          .from('bank_statement_line')
          .select('id, bank_account_id, bank_reference_no, amount')
          .eq('bank_reference_no', targetBank.bank_reference_no)
          .single();

        if (bRow) {
          await supabase
            .from('bank_statement_line')
            .update({ status: newStatus })
            .eq('id', bRow.id);

          const matchedVouchers = journalLines
            .filter((j) => splitSelectedJournalIds.includes(j.id))
            .map((j) => j.voucher_code);

          const { data: jRows } = await supabase
            .from('transaction_journal')
            .select('id, voucher_code, transaction_journal_line(id, line_no)')
            .in('voucher_code', matchedVouchers);

          if (jRows && jRows.length > 0) {
            const jIds = jRows.map((j) => j.id);
            await supabase
              .from('transaction_journal_line')
              .update({ is_reconciled: true })
              .in('transaction_journal_id', jIds);

            const matchInserts = [];
            for (const jRow of jRows) {
              const jlRow =
                jRow?.transaction_journal_line?.find((l: any) => l.line_no === 1) ||
                jRow?.transaction_journal_line?.[0];
              const origJournal = journalLines.find((j) => j.voucher_code === jRow.voucher_code);
              const jAmount = origJournal ? origJournal.amount : 0;
              if (jlRow) {
                matchInserts.push({
                  company_id: 1,
                  bank_account_id: bRow.bank_account_id || 1,
                  session_id: null,
                  match_group_id: groupId,
                  statement_line_id: bRow.id,
                  transaction_journal_id: jRow.id,
                  transaction_journal_line_id: jlRow.id,
                  matched_amount: jAmount,
                  match_type: matchType,
                  matched_by: 'USER',
                  matched_at: new Date().toISOString(),
                });
              }
            }

            if (matchInserts.length > 0) {
              await supabase.from('bank_reconciliation_match').insert(matchInserts);
            }
          }
        }
      } catch (e) {
        console.error('Error syncing split match to Supabase:', e);
      }
    }
  };

  // ---------------------------------------------------------
  // 1-Click Adjusting Journal
  // ---------------------------------------------------------
  const handleOpenAdjustModal = (bank: BankStatementLine) => {
    setTargetBankLine(bank);
    setAdjustDescription(`Penyesuaian mutasi: ${bank.description}`);
    setShowAdjustModal(true);
  };

  const handleSaveAdjustJournal = () => {
    if (!targetBankLine) return;
    const groupId = `GRP-ADJUST-${Date.now()}`;

    const newJ: JournalLine = {
      id: `JL-ADJ-${Date.now()}`,
      voucher_code: `BKM-ADJ-${Date.now().toString().slice(-4)}`,
      transaction_date: targetBankLine.transaction_date,
      account_code: adjustAccountCode,
      account_name:
        adjustAccountCode === '112-100'
          ? 'Piutang Usaha Pelanggan'
          : adjustAccountCode === '411-100'
            ? 'Pendapatan Operasional Lain-lain'
            : 'Beban Administrasi Bank',
      description: adjustDescription,
      type: targetBankLine.mutation_type,
      amount: targetBankLine.amount,
      is_reconciled: true,
      matched_group_id: groupId,
    };

    setJournalLines((prev) => [...prev, newJ]);
    setBankLines((prev) =>
      prev.map((b) =>
        b.id === targetBankLine.id
          ? { ...b, status: 'MATCHED', matched_group_id: groupId }
          : b
      )
    );

    setShowAdjustModal(false);
    setTargetBankLine(null);
  };

  // ---------------------------------------------------------
  // Period Close / Lock
  // ---------------------------------------------------------
  const handleLockSession = () => {
    if (!stats.isBalanced) return;

    setSession((prev) => ({
      ...prev,
      status: 'LOCKED',
      reconciled_at: new Date().toISOString(),
      reconciled_by: 'Budi Santoso, S.E., M.Ak.',
    }));

    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#0284c7', '#059669', '#3b82f6'],
    });

    setShowReportModal(true);
  };

  const handleResetDemo = async () => {
    setSession(INITIAL_SESSION);
    setBankLines([]);
    setSyncSession(null);
    setSyncHistory([]);
    try { localStorage.removeItem("N8N_BANK_SYNC_HISTORY"); } catch (_) {}
    setSelectedBankIds([]);
    setSelectedJournalIds([]);
    setBankFilter('ALL');
    setBankAccountFilter('ALL');
    setJournalAccountFilter('ALL');
    setPeriodFilter('ALL');

    if (isSupabaseConfigured && supabase) {
      try {
        // 1. MUST delete match records first to avoid foreign key violation (error code 23503)
        await supabase
          .from('bank_reconciliation_match')
          .delete()
          .neq('id', 0);

        // 2. Un-reconcile all journal lines in Supabase
        await supabase
          .from('transaction_journal_line')
          .update({ is_reconciled: false })
          .neq('id', 0);

        // 3. Delete bank statement lines (now safe from FK violation)
        await supabase
          .from('bank_statement_line')
          .delete()
          .neq('id', 0);

        // 4. Reload fresh 104 journals so UI keeps all 104 journals ready to reconcile
        const freshJournals = await fetchJournalLinesFromSupabase();
        if (freshJournals.length > 0) {
          setJournalLines(freshJournals);
        }
      } catch (e) {
        console.error('Error resetting Supabase demo:', e);
      }
    } else {
      setJournalLines(INITIAL_JOURNAL_LINES);
    }

    setBannerMessage(
      'Data demo berhasil direset: mutasi bank dikosongkan (0 baris). Silakan trigger dari n8n untuk mensimulasikan penarikan data realtime!'
    );
    setTimeout(() => setBannerMessage(null), 5000);
  };

  // Filtered queries
  // Dynamic counts for status tabs
  const bankCounts = useMemo(() => {
    let all = 0, unmatched = 0, matched = 0;
    for (const b of bankLines) {
      const matchBank = bankFilter === 'ALL' || (b.bank_code && b.bank_code === bankFilter);
      const matchAccount = bankAccountFilter === 'ALL' || (b.account_number && b.account_number === bankAccountFilter);
      const matchPeriod = periodFilter === 'ALL' || b.transaction_date.startsWith(periodFilter);
      if (matchBank && matchAccount && matchPeriod) {
        all++;
        if (b.status === 'MATCHED') matched++;
        else unmatched++;
      }
    }
    return { all, unmatched, matched };
  }, [bankLines, bankFilter, bankAccountFilter, periodFilter]);

  const journalCounts = useMemo(() => {
    let all = 0, unmatched = 0, matched = 0;
    for (const j of journalLines) {
      const matchAccount = journalAccountFilter === 'ALL' || j.account_code === journalAccountFilter;
      const matchPeriod = periodFilter === 'ALL' || j.transaction_date.startsWith(periodFilter);
      if (matchAccount && matchPeriod) {
        all++;
        if (j.is_reconciled) matched++;
        else unmatched++;
      }
    }
    return { all, unmatched, matched };
  }, [journalLines, journalAccountFilter, periodFilter]);

  // Filtered queries
  const filteredBank = useMemo(() => {
    const rawQ = searchBank.trim().toLowerCase();
    const numQ = rawQ.replace(/[.,\s]/g, '').replace(/^rp/i, '');

    return bankLines.filter((b) => {
      const matchTab =
        bankTab === 'ALL' ||
        (bankTab === 'UNMATCHED' && (b.status === 'UNMATCHED' || b.status === 'PARTIALLY_MATCHED')) ||
        (bankTab === 'MATCHED' && b.status === 'MATCHED');

      const matchBank =
        bankFilter === 'ALL' ||
        (b.bank_code && b.bank_code === bankFilter);

      const matchAccount =
        bankAccountFilter === 'ALL' ||
        (b.account_number && b.account_number === bankAccountFilter);

      const matchPeriod =
        periodFilter === 'ALL' ||
        b.transaction_date.startsWith(periodFilter);

      const matchSearch =
        rawQ === '' ||
        b.description.toLowerCase().includes(rawQ) ||
        b.bank_reference_no.toLowerCase().includes(rawQ) ||
        (b.bank_code && b.bank_code.toLowerCase().includes(rawQ)) ||
        (b.bank_name && b.bank_name.toLowerCase().includes(rawQ)) ||
        (b.account_number && b.account_number.toLowerCase().includes(rawQ)) ||
        (b.period_name && b.period_name.toLowerCase().includes(rawQ)) ||
        (numQ !== '' && b.amount.toString().includes(numQ)) ||
        formatIDR(b.amount).toLowerCase().includes(rawQ);

      return matchTab && matchBank && matchAccount && matchPeriod && matchSearch;
    });
  }, [bankLines, bankTab, bankFilter, bankAccountFilter, periodFilter, searchBank]);

  const filteredJournal = useMemo(() => {
    const rawQ = searchJournal.trim().toLowerCase();
    const numQ = rawQ.replace(/[.,\s]/g, '').replace(/^rp/i, '');

    return journalLines.filter((j) => {
      const matchTab =
        journalTab === 'ALL' ||
        (journalTab === 'UNMATCHED' && !j.is_reconciled) ||
        (journalTab === 'MATCHED' && j.is_reconciled);

      const matchAccount =
        journalAccountFilter === 'ALL' ||
        j.account_code === journalAccountFilter;

      const matchPeriod =
        periodFilter === 'ALL' ||
        j.transaction_date.startsWith(periodFilter);

      const matchSearch =
        rawQ === '' ||
        j.description.toLowerCase().includes(rawQ) ||
        j.voucher_code.toLowerCase().includes(rawQ) ||
        j.account_name.toLowerCase().includes(rawQ) ||
        j.account_code.toLowerCase().includes(rawQ) ||
        (j.period_name && j.period_name.toLowerCase().includes(rawQ)) ||
        (numQ !== '' && j.amount.toString().includes(numQ)) ||
        formatIDR(j.amount).toLowerCase().includes(rawQ);

      return matchTab && matchAccount && matchPeriod && matchSearch;
    });
  }, [journalLines, journalTab, journalAccountFilter, periodFilter, searchJournal]);

  // Paginated bank slices
  const bankTotalPages = Math.max(1, Math.ceil(filteredBank.length / bankPageSize));
  const paginatedBankLines = useMemo(() => {
    const start = (bankPage - 1) * bankPageSize;
    return filteredBank.slice(start, start + bankPageSize);
  }, [filteredBank, bankPage, bankPageSize]);

  // Paginated journal slices
  const journalTotalPages = Math.max(1, Math.ceil(filteredJournal.length / journalPageSize));
  const paginatedJournalLines = useMemo(() => {
    const start = (journalPage - 1) * journalPageSize;
    return filteredJournal.slice(start, start + journalPageSize);
  }, [filteredJournal, journalPage, journalPageSize]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased flex">
      {/* ========================================================
          LEFT ENTERPRISE SIDEBAR NAVIGATION
          ======================================================== */}
      {/* Mobile Backdrop when Sidebar Drawer is open */}
      {isSidebarOpen && (
        <div
          onClick={toggleSidebarOpen}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-35 md:hidden transition-opacity"
        />
      )}

      {/* ========================================================
          LEFT ENTERPRISE SIDEBAR NAVIGATION (COLLAPSIBLE / SLIM / HIDE)
          ======================================================== */}
      <aside
        className={`fixed md:sticky top-0 h-screen z-40 bg-slate-900 text-slate-300 shrink-0 flex flex-col justify-between border-r border-slate-800 no-print transition-all duration-300 ease-in-out ${
          !isSidebarOpen
            ? '-translate-x-full md:translate-x-0 md:w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none p-0'
            : isSidebarSlim
            ? 'translate-x-0 w-16'
            : 'translate-x-0 w-64 shadow-2xl md:shadow-none'
        }`}
      >
        {/* Brand & Nav Menus */}
        <div className={`space-y-6 overflow-y-auto ${isSidebarSlim ? 'p-2' : 'p-4'}`}>
          {/* Brand Header */}
          <div className={`flex items-center ${isSidebarSlim ? 'flex-col gap-2 py-2' : 'justify-between px-2 py-2'} border-b border-slate-800/80 pb-3`}>
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-9 w-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-100 shrink-0 cursor-pointer hover:bg-slate-700/80 transition"
                onClick={toggleSidebarSlim}
                title={isSidebarSlim ? "Perluas Menu (Expand)" : "Kecilkan Menu (Compact Icon)"}
              >
                <Landmark className="w-4 h-4 text-slate-300" />
              </div>
              {!isSidebarSlim && (
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-slate-100 tracking-tight leading-none truncate">Gemoy ERP</h1>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">Sistem Rekonsiliasi Kas</p>
                </div>
              )}
            </div>

            {!isSidebarSlim ? (
              <div className="flex items-center gap-1 shrink-0">
                {/* Slim toggle */}
                <button
                  type="button"
                  onClick={toggleSidebarSlim}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                  title="Mode Ramping / Mini Icon"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                {/* Hide sidebar */}
                <button
                  type="button"
                  onClick={toggleSidebarOpen}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                  title="Sembunyikan Menu (Hide - Ctrl+B)"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 pt-1">
                <button
                  type="button"
                  onClick={toggleSidebarSlim}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                  title="Perluas Menu (Expand)"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={toggleSidebarOpen}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                  title="Sembunyikan Menu (Hide)"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Group 1: Operasional Kas */}
          <div className="space-y-1">
            {!isSidebarSlim ? (
              <div className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Operasional Kas
              </div>
            ) : (
              <div className="border-t border-slate-800 my-2" title="Operasional Kas" />
            )}
            
            <button
              onClick={() => setActiveNav('RECONCILIATION')}
              title="Rekonsiliasi Bank"
              className={`w-full rounded-lg transition flex items-center text-xs font-medium cursor-pointer ${
                isSidebarSlim ? 'justify-center p-2.5 relative' : 'justify-between px-3 py-2'
              } ${
                activeNav === 'RECONCILIATION'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Scale className="w-4 h-4 text-slate-400 shrink-0" />
                {!isSidebarSlim && <span className="truncate">Rekonsiliasi Bank</span>}
              </div>
              {!isSidebarSlim ? (
                <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5 rounded font-mono">
                  {bankLines.length}
                </span>
              ) : bankLines.length > 0 ? (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500" />
              ) : null}
            </button>

            <button
              onClick={() => setActiveNav('INVOICE_OCR')}
              title="Pencatatan Faktur (OCR)"
              className={`w-full rounded-lg transition flex items-center text-xs font-medium cursor-pointer ${
                isSidebarSlim ? 'justify-center p-2.5' : 'justify-between px-3 py-2'
              } ${
                activeNav === 'INVOICE_OCR'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ReceiptText className="w-4 h-4 text-slate-400 shrink-0" />
                {!isSidebarSlim && <span className="truncate">Pencatatan Faktur (OCR)</span>}
              </div>
            </button>

            <button
              onClick={() => setActiveNav('JOURNALS')}
              title="Buku Jurnal Umum"
              className={`w-full rounded-lg transition flex items-center text-xs font-medium cursor-pointer ${
                isSidebarSlim ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
              } ${
                activeNav === 'JOURNALS'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
              {!isSidebarSlim && <span className="truncate">Buku Jurnal Umum</span>}
            </button>

            <button
              onClick={() => setActiveNav('FINANCIAL_REPORTS')}
              title="Laporan Keuangan (Neraca & Laba Rugi)"
              className={`w-full rounded-lg transition flex items-center text-xs font-medium cursor-pointer ${
                isSidebarSlim ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
              } ${
                activeNav === 'FINANCIAL_REPORTS'
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Scale className={`w-4 h-4 shrink-0 ${activeNav === 'FINANCIAL_REPORTS' ? 'text-white' : 'text-indigo-400'}`} />
              {!isSidebarSlim && <span className="truncate font-semibold text-slate-100">Laporan Keuangan</span>}
            </button>
          </div>

          {/* Group 2: Master Data */}
          <div className="space-y-1 pt-3 border-t border-slate-800">
            {!isSidebarSlim ? (
              <div className="px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Master Data Akuntansi
              </div>
            ) : null}

            <button
              onClick={() => setActiveNav('ACCOUNTS')}
              title="Bagan Akun (COA)"
              className={`w-full rounded-lg transition flex items-center text-xs font-medium cursor-pointer ${
                isSidebarSlim ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
              } ${
                activeNav === 'ACCOUNTS'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4 text-slate-400 shrink-0" />
              {!isSidebarSlim && <span className="truncate">Bagan Akun (COA)</span>}
            </button>

            <button
              onClick={() => setActiveNav('BANK_ACCOUNTS')}
              title="Master Rekening Bank"
              className={`w-full rounded-lg transition flex items-center text-xs font-medium cursor-pointer ${
                isSidebarSlim ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
              } ${
                activeNav === 'BANK_ACCOUNTS'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
              {!isSidebarSlim && <span className="truncate">Master Rekening Bank</span>}
            </button>

            <button
              onClick={() => setActiveNav('FISCAL_PERIODS')}
              title="Periode Fiskal"
              className={`w-full rounded-lg transition flex items-center text-xs font-medium cursor-pointer ${
                isSidebarSlim ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
              } ${
                activeNav === 'FISCAL_PERIODS'
                  ? 'bg-slate-800 text-white font-semibold border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
              {!isSidebarSlim && <span className="truncate">Periode Fiskal</span>}
            </button>
          </div>
        </div>

        {/* Bottom Sidebar: Status Engine */}
        <div className={`border-t border-slate-800 bg-slate-950/40 ${isSidebarSlim ? 'p-2 flex flex-col items-center gap-2' : 'p-4 space-y-2'}`}>
          {!isSidebarSlim ? (
            <>
              {bankLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(true)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md bg-slate-800/60 hover:bg-slate-800 text-slate-300 text-[11px] font-medium transition cursor-pointer flex items-center justify-between"
                  title="Klik untuk melihat riwayat mutasi"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">Sync: {syncSession?.timestamp || 'Aktif'}</span>
                  </span>
                  <span className="text-[9px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded font-mono shrink-0">Log</span>
                </button>
              )}

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  n8n OCR Engine
                </span>
                <span className="font-mono text-[10px] text-slate-400">:5678</span>
              </div>
              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                <span>Database</span>
                <span className={isLiveConnected ? "text-emerald-400 font-medium" : "text-slate-400"}>
                  {isLiveConnected ? "Online" : "Lokal"}
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1" title={`n8n Engine :5678 • DB: ${isLiveConnected ? 'Online' : 'Lokal'}`}>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================
          RIGHT MAIN COLUMN (CLEAN SINGLE HEADER + CONTENT)
          ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Clean Single Top App Bar */}
        <header className="bg-white border-b border-slate-200/90 sticky top-0 z-30 no-print shadow-2xs h-14 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Active View Title & Sidebar Toggle */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Sidebar Hide/Show Toggle Button */}
            <button
              type="button"
              onClick={toggleSidebarOpen}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 border border-slate-200 transition shadow-2xs cursor-pointer shrink-0"
              title={isSidebarOpen ? "Sembunyikan Menu (Ctrl+B)" : "Tampilkan Menu (Ctrl+B)"}
            >
              <PanelLeft className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">
                {isSidebarOpen ? 'Hide Menu' : 'Show Menu'}
              </span>
            </button>

            {!isSidebarOpen && (
              <div className="hidden md:flex items-center gap-2 pl-1 pr-2 border-r border-slate-200 shrink-0">
                <div className="h-6 w-6 rounded-md bg-slate-900 flex items-center justify-center text-slate-100 shadow-2xs">
                  <Landmark className="w-3 h-3 text-slate-300" />
                </div>
                <span className="text-xs font-bold text-slate-800 tracking-tight">Gemoy ERP</span>
              </div>
            )}
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              {activeNav === 'RECONCILIATION' && (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Rekonsiliasi Bank Otomatis</span>
                </>
              )}
              {activeNav === 'INVOICE_OCR' && (
                <>
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Digitalisasi Faktur (OCR)</span>
                </>
              )}
              {activeNav === 'JOURNALS' && (
                <>
                  <BookOpen className="w-4 h-4 text-sky-600" />
                  <span>Buku Transaksi Jurnal (General Ledger)</span>
                </>
              )}
              {activeNav === 'ACCOUNTS' && (
                <>
                  <Layers className="w-4 h-4 text-purple-600" />
                  <span>Bagan Akun (Chart of Accounts)</span>
                </>
              )}
              {activeNav === 'BANK_ACCOUNTS' && (
                <>
                  <Building2 className="w-4 h-4 text-cyan-600" />
                  <span>Master Rekening Bank</span>
                </>
              )}
              {activeNav === 'FISCAL_PERIODS' && (
                <>
                  <Calendar className="w-4 h-4 text-orange-600" />
                  <span>Master Periode Fiskal</span>
                </>
              )}
            </h2>
          </div>

          {/* Right Header Controls (Bank Selector & Action Buttons) */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Bank Account Selector */}
            <div className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200/70 rounded-lg border border-slate-200 px-3 py-1.5 text-xs transition">
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={session.account_number}
                onChange={(e) => {
                  const selectedAcc = e.target.value;
                  if (SESSIONS_BY_ACCOUNT[selectedAcc]) {
                    setSession(SESSIONS_BY_ACCOUNT[selectedAcc]);
                    setSelectedBankIds([]);
                    setSelectedJournalIds([]);
                    if (selectedAcc === 'ALL') {
                      setBankFilter('ALL');
                      setBankAccountFilter('ALL');
                      setJournalAccountFilter('ALL');
                    } else {
                      const accData = MOCK_BANK_ACCOUNTS.find((a) => a.account_number === selectedAcc);
                      if (accData) {
                        setBankFilter(accData.bank_code);
                        setBankAccountFilter(accData.account_number);
                        setJournalAccountFilter(accData.account_code);
                      }
                    }
                  }
                }}
                className="bg-transparent font-semibold text-slate-800 text-xs focus:outline-none cursor-pointer pr-1 max-w-[200px] xl:max-w-[240px] truncate"
              >
                <option value="ALL">🏢 [SEMUA] Konsolidasi Semua Bank</option>
                {MOCK_BANK_ACCOUNTS.map((acc) => (
                  <option key={acc.id} value={acc.account_number}>
                    [{acc.bank_code}] {acc.account_name} &bull; {acc.account_number}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Action Buttons */}
            {activeNav === 'RECONCILIATION' && (
              <button
                onClick={() => setShowAlgorithmModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-2xs transition cursor-pointer"
                title="Buka penjelasan 3 poin logika algoritma 3-Way Auto-Match"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-Match (3-Way)</span>
              </button>
            )}

            <button
              onClick={() => setShowReportModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 shadow-2xs transition cursor-pointer"
              title="Cetak Berita Acara &amp; Laporan Rekonsiliasi Bank Resmi (PDF)"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Cetak PDF</span>
            </button>

            <button
              onClick={handleResetDemo}
              className="inline-flex items-center gap-1.5 p-1.5 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-500 hover:text-rose-600 border border-slate-200 shadow-2xs transition cursor-pointer"
              title="Kembalikan semua mutasi dan jurnal ke data awal demo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {stats.isBalanced && session.status !== 'LOCKED' && (
              <button
                onClick={handleLockSession}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                Kunci Periode &amp; Selesaikan
              </button>
            )}
          </div>
        </header>

        {/* Main Content Body */}
        <main
          className={`p-6 lg:p-8 space-y-6 flex-1 max-w-[1920px] w-full mx-auto print:p-0 print:m-0 print:max-w-none print:w-full print:space-y-0 ${
            showReportModal ? 'no-print' : ''
          }`}
        >
        {activeNav === 'ACCOUNTS' && <AccountsView />}
        {activeNav === 'BANK_ACCOUNTS' && <BankAccountsView />}
        {activeNav === 'FISCAL_PERIODS' && <FiscalPeriodsView />}
        {activeNav === 'JOURNALS' && <JournalsView />}
        {activeNav === 'FINANCIAL_REPORTS' && (
          <FinancialReportsView onNavigateToRecon={() => setActiveNav('RECONCILIATION')} />
        )}
        {activeNav === 'INVOICE_OCR' && (
          <InvoiceOcrView
            onNavigateToRecon={() => setActiveNav('RECONCILIATION')}
            onJournalPosted={(extracted) => {
              const newLine: JournalLine = {
                id: generateUUID(),
                voucher_code: extracted.invoice_number,
                transaction_date: extracted.invoice_date,
                account_code: '1-1001',
                account_name: 'Kas / Bank BCA',
                description: extracted.description || extracted.vendor_name,
                type: 'DB',
                amount: extracted.total_amount,
                is_reconciled: false,
                invoice_no: extracted.invoice_number,
                partner_name: extracted.vendor_name,
              };
              setJournalLines((prev) => [newLine, ...prev]);
              setBannerMessage(
                `Invoice ${extracted.invoice_number} (${extracted.vendor_name}) berhasil diposting ke Jurnal Umum dan siap direkonsiliasi!`
              );
            }}
          />
        )}

        {activeNav === 'RECONCILIATION' && (
          <>
            {/* Banner Alert */}
            {bannerMessage && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-2.5 rounded-lg text-xs flex items-center justify-between font-medium shadow-sm">
                <span>{bannerMessage}</span>
                <button onClick={() => setBannerMessage(null)} className="text-blue-500 hover:text-blue-900">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Enterprise Financial Summary KPI Cards (4 Distinct Modular Cards) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Saldo Rekening Koran Bank */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Saldo Rekening Koran
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live Feed
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-extrabold font-mono text-slate-900 tracking-tight">
                    Rp {formatIDR(stats.bankEnding)}
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>{periodFilter === 'ALL' ? 'Tahun Buku 2026' : `Periode ${periodFilter}`}</span>
                  <span className="font-semibold text-slate-700">
                    {bankLines.length} mutasi
                    {bankLines.filter((b) => b.status === 'MATCHED').length > 0 && (
                      <span className="text-emerald-600 font-medium ml-1">
                        ({bankLines.filter((b) => b.status === 'MATCHED').length} cocok)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Card 2: Saldo Buku Kas GL */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Saldo Buku Kas ({journalAccountFilter === 'ALL' ? 'GL 111-200' : journalAccountFilter})
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      ERP General Ledger
                    </span>
                  </div>
                  <div className="mt-2 text-2xl font-extrabold font-mono text-slate-900 tracking-tight">
                    Rp {formatIDR(stats.glEnding)}
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Buku Besar Perusahaan</span>
                  <span className="font-semibold text-slate-700">
                    {journalLines.length} voucher
                    {journalLines.filter((j) => j.is_reconciled).length > 0 && (
                      <span className="text-emerald-600 font-medium ml-1">
                        ({journalLines.filter((j) => j.is_reconciled).length} kliring)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Card 3: Pos Gantung / Timing Differences */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs hover:shadow-xs transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Pos Gantung (Timing Diff)
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">
                      PSAK 2
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Setoran dlm proses:</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {stats.depositsInTransit > 0 ? `+ Rp ${formatIDR(stats.depositsInTransit)}` : 'Rp 0'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Cek beredar (vendor):</span>
                      <span className="font-mono font-semibold text-slate-800">
                        {stats.outstandingDisbursements > 0 ? `- Rp ${formatIDR(stats.outstandingDisbursements)}` : '(Rp 0)'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Net Timing Diff</span>
                  <span className="font-mono font-semibold text-slate-800">
                    Rp {formatIDR(stats.depositsInTransit - stats.outstandingDisbursements)}
                  </span>
                </div>
              </div>

              {/* Card 4: Selisih Rekonsiliasi (Variance Discrepancy) */}
              <div
                className={`rounded-xl p-4 border transition flex flex-col justify-between shadow-2xs ${
                  stats.isBalanced
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-rose-50/60 border-rose-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider ${
                        stats.isBalanced ? 'text-emerald-800' : 'text-rose-800'
                      }`}
                    >
                      Selisih Akhir (Discrepancy)
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        stats.isBalanced
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border-rose-300'
                      }`}
                    >
                      {stats.isBalanced ? 'SEIMBANG (Rp 0)' : 'SELISIH BELUM 0'}
                    </span>
                  </div>
                  <div
                    className={`mt-2 text-2xl font-extrabold font-mono tracking-tight ${
                      stats.isBalanced ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    Rp {formatIDR(stats.difference)}
                  </div>
                </div>
                <div
                  className={`mt-3 pt-2.5 border-t text-xs flex items-center justify-between ${
                    stats.isBalanced
                      ? 'border-emerald-200/60 text-emerald-700 font-medium'
                      : 'border-rose-200/60 text-rose-700 font-medium'
                  }`}
                >
                  <span className="truncate">
                    {stats.isBalanced
                      ? 'Seluruh mutasi telah cocok dan terverifikasi'
                      : `${stats.unmatchedCount} mutasi belum kliring/terjurnal`}
                  </span>
                </div>
              </div>
            </div>

            {/* 2-Panel Professional Table Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* ==================== LEFT: BANK STATEMENT MUTATIONS ==================== */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[640px] overflow-hidden">
                {/* Table Control Bar */}
                <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Mutasi Rekening Koran ({bankFilter === 'ALL' ? 'Semua Bank' : bankFilter === 'MANDIRI' ? 'Bank Mandiri' : bankFilter})
                      </h2>
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-200/80 text-slate-700">
                        {filteredBank.length}
                      </span>
                      {bankLines.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowHistoryModal(true)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-[10px] font-medium shadow-2xs transition cursor-pointer"
                          title="Klik untuk melihat riwayat batch ingestion n8n"
                        >
                          <Clock className="w-2.5 h-2.5 text-sky-600" />
                          <span>Sync n8n: <strong className="font-semibold">{syncSession?.timestamp || 'Aktif'}</strong> ({bankLines.length} baris)</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                          <span>Menunggu Ingestion n8n</span>
                        </span>
                      )}
                    </div>

                    {/* Segmented Control with Soft Modern Badges */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200/80 text-xs font-medium text-slate-600 gap-0.5">
                      <button
                        onClick={() => setBankTab('ALL')}
                        className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                          bankTab === 'ALL'
                            ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                            : 'hover:text-slate-900 text-slate-600'
                        }`}
                      >
                        <span>Semua</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                            bankTab === 'ALL'
                              ? 'bg-slate-200 text-slate-800'
                              : 'bg-slate-200/70 text-slate-600'
                          }`}
                        >
                          {bankCounts.all}
                        </span>
                      </button>
                      <button
                        onClick={() => setBankTab('UNMATCHED')}
                        className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                          bankTab === 'UNMATCHED'
                            ? 'bg-white text-amber-900 shadow-2xs font-semibold'
                            : 'hover:text-slate-900 text-slate-600'
                        }`}
                      >
                        <span>Belum Cocok</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                            bankTab === 'UNMATCHED'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200/60'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {bankCounts.unmatched}
                        </span>
                      </button>
                      <button
                        onClick={() => setBankTab('MATCHED')}
                        className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                          bankTab === 'MATCHED'
                            ? 'bg-white text-emerald-900 shadow-2xs font-semibold'
                            : 'hover:text-slate-900 text-slate-600'
                        }`}
                      >
                        <span>Sudah Cocok</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                            bankTab === 'MATCHED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/60'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {bankCounts.matched}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Bank Filter Quick Selector Bar */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                    <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-0.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" /> Filter Bank:
                      </span>
                      {[
                        { code: 'ALL', label: 'Semua Bank' },
                        { code: 'MANDIRI', label: 'Bank Mandiri' },
                        { code: 'BCA', label: 'BCA' },
                        { code: 'BRI', label: 'BRI' },
                        { code: 'BNI', label: 'BNI' },
                      ].map((b) => (
                        <button
                          key={b.code}
                          onClick={() => {
                            setBankFilter(b.code);
                            if (b.code !== 'ALL') {
                              const firstAcc = MOCK_BANK_ACCOUNTS.find((a) => a.bank_code === b.code);
                              if (firstAcc && SESSIONS_BY_ACCOUNT[firstAcc.account_number]) {
                                setSession(SESSIONS_BY_ACCOUNT[firstAcc.account_number]);
                                setSelectedBankIds([]);
                                setSelectedJournalIds([]);
                              }
                            }
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer shrink-0 ${bankFilter === b.code
                              ? 'bg-slate-900 text-white font-semibold shadow-xs'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>

                    {/* Sub-account selector */}
                    <div className="shrink-0 flex items-center gap-1">
                      <select
                        value={bankAccountFilter}
                        onChange={(e) => {
                          const selectedAcc = e.target.value;
                          setBankAccountFilter(selectedAcc);
                          if (selectedAcc === 'ALL') {
                            setJournalAccountFilter('ALL');
                            setSession(SESSIONS_BY_ACCOUNT['ALL'] || INITIAL_SESSION);
                          } else {
                            const acc = MOCK_BANK_ACCOUNTS.find((a) => a.account_number === selectedAcc);
                            if (acc) {
                              setJournalAccountFilter(acc.account_code);
                              if (SESSIONS_BY_ACCOUNT[selectedAcc]) {
                                setSession(SESSIONS_BY_ACCOUNT[selectedAcc]);
                              }
                            }
                          }
                          setSelectedBankIds([]);
                          setSelectedJournalIds([]);
                        }}
                        className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-700 font-medium focus:outline-none cursor-pointer max-w-[190px] truncate"
                      >
                        <option value="ALL">Semua Rekening ({bankFilter === 'ALL' ? 'Semua Bank' : bankFilter})</option>
                        {MOCK_BANK_ACCOUNTS.filter((acc) => bankFilter === 'ALL' || acc.bank_code === bankFilter).map((acc) => (
                          <option key={acc.id} value={acc.account_number}>
                            {acc.account_number} ({acc.branch_name})
                          </option>
                        ))}
                      </select>

                      <div className="h-3.5 w-px bg-slate-200 shrink-0 mx-0.5" />

                      <select
                        value={periodFilter}
                        onChange={(e) => setPeriodFilter(e.target.value)}
                        className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-700 font-medium focus:outline-none cursor-pointer max-w-[155px] truncate"
                        title="Filter Periode Mutasi Bank"
                      >
                        <option value="ALL">🗓️ Semua Periode</option>
                        <option value="2026-10">📌 Okt 2026 (Aktif)</option>
                        <option value="2026-11">Nov 2026</option>
                        <option value="2026-12">Des 2026</option>
                        <option value="2026-09">Sep 2026</option>
                        <option value="2026-08">Agu 2026</option>
                        <option value="2026-07">Jul 2026</option>
                        <option value="2026-06">Jun 2026</option>
                        <option value="2026-05">Mei 2026</option>
                        <option value="2026-04">Apr 2026</option>
                        <option value="2026-03">Mar 2026</option>
                        <option value="2026-02">Feb 2026</option>
                        <option value="2026-01">Jan 2026</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Prominent Search Textbox Bar */}
                <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <div className="relative flex items-center bg-white border border-slate-300 rounded-lg shadow-2xs px-2.5 py-1.5 focus-within:border-slate-800 focus-within:ring-2 focus-within:ring-slate-900/10 transition">
                    <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
                    <input
                      type="text"
                      placeholder="Cari narasi mutasi, nomor referensi, nominal (misal: 22.000.000)..."
                      value={searchBank}
                      onChange={(e) => setSearchBank(e.target.value)}
                      className="w-full text-xs text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
                    />
                    {searchBank && (
                      <button
                        onClick={() => setSearchBank('')}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition shrink-0 ml-1 cursor-pointer"
                        title="Hapus pencarian"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dense Financial Table */}
                <div className="flex-1 overflow-auto">
                  {filteredBank.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <RefreshCw className="w-6 h-6 mb-2 opacity-25" />
                      <p className="text-xs font-semibold text-slate-600">Menunggu Ingestion Mutasi Bank</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs">
                        Jalankan workflow di kanvas n8n untuk mensimulasikan penarikan rekening koran secara realtime.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 font-semibold text-[11px]">
                        <tr>
                          <th className="w-8 py-2.5 px-3 text-center">#</th>
                          <th className="py-2.5 px-2">Tanggal &amp; Ref</th>
                          <th className="py-2.5 px-2">Deskripsi Mutasi</th>
                          <th className="py-2.5 px-3 text-right">Debit / Kredit (IDR)</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {paginatedBankLines.map((bank) => {
                          const isSelected = selectedBankIds.includes(bank.id);
                          const isMatched = bank.status === 'MATCHED';
                          const isPartiallyMatched = bank.status === 'PARTIALLY_MATCHED';
                          const isHighlightedCandidate = recommendedBankIdsForSelectedJournal.includes(bank.id);
                          const suggestion = bankMatchSuggestions.get(bank.id);
                          const isFreshNew = highlightedBankRef === bank.bank_reference_no;

                          return (
                            <tr
                              key={bank.id}
                              onClick={() => {
                                if (isMatched) return;
                                setSelectedBankIds((prev) =>
                                  isSelected ? prev.filter((id) => id !== bank.id) : [...prev, bank.id]
                                );
                              }}
                              className={`transition cursor-pointer select-none ${
                                isFreshNew
                                  ? 'bg-emerald-100/90 ring-2 ring-emerald-500 shadow-sm'
                                  : isSelected
                                  ? 'bg-blue-50/80 ring-2 ring-blue-500'
                                  : isHighlightedCandidate
                                  ? 'bg-emerald-50/80 ring-2 ring-emerald-500/80 border-emerald-300'
                                  : isMatched
                                  ? 'bg-slate-50/50 text-slate-400 cursor-default'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected || isMatched}
                                  disabled={isMatched}
                                  onChange={() => {
                                    if (isMatched) return;
                                    setSelectedBankIds((prev) =>
                                      isSelected ? prev.filter((id) => id !== bank.id) : [...prev, bank.id]
                                    );
                                  }}
                                  className="rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer disabled:cursor-default"
                                />
                              </td>
                              <td className="py-2.5 px-2 font-mono text-[11px] whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-slate-800">{bank.transaction_date}</span>
                                  {isFreshNew && (
                                    <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded shadow-2xs animate-bounce font-sans">
                                      BARU
                                    </span>
                                  )}
                                  <span className="text-[9px] font-sans font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                    {bank.period_name ? bank.period_name.slice(0, 3) + ' ' + bank.transaction_date.slice(0, 4) : bank.transaction_date.slice(0, 7)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                  <span>{bank.bank_reference_no}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopyCode(bank.bank_reference_no, e)}
                                    className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition cursor-pointer"
                                    title={copiedCode === bank.bank_reference_no ? "Nomor referensi disalin!" : "Salin nomor referensi"}
                                  >
                                    {copiedCode === bank.bank_reference_no ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-2.5 h-2.5" />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 min-w-[220px] max-w-[440px]">
                                <div className="flex items-center gap-1.5">
                                  {bank.bank_code && (
                                    <span
                                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${bank.bank_code === 'MANDIRI'
                                          ? 'bg-amber-50 text-amber-900 border-amber-200'
                                          : bank.bank_code === 'BCA'
                                            ? 'bg-blue-50 text-blue-900 border-blue-200'
                                            : bank.bank_code === 'BRI'
                                              ? 'bg-sky-50 text-sky-900 border-sky-200'
                                              : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                        }`}
                                    >
                                      {bank.bank_code}
                                    </span>
                                  )}
                                  <div className="truncate font-medium text-slate-800" title={bank.description}>
                                    {bank.description}
                                  </div>
                                </div>

                                {/* Option 1: Selected candidate highlight feedback */}
                                {isHighlightedCandidate && !isSelected && activeSelectedJournal && (
                                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
                                      Rekomendasi Cocok: {activeSelectedJournal.voucher_code} (Selisih Rp 0)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyCode(activeSelectedJournal.voucher_code, e)}
                                      className="p-1 text-slate-500 hover:text-slate-800 hover:bg-emerald-200/60 rounded transition cursor-pointer"
                                      title={copiedCode === activeSelectedJournal.voucher_code ? "Disalin!" : "Salin nomor voucher"}
                                    >
                                      {copiedCode === activeSelectedJournal.voucher_code ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApproveSingleMatch(bank, activeSelectedJournal);
                                      }}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] shadow-2xs transition cursor-pointer"
                                    >
                                      <Check className="w-3 h-3" />
                                      Pasangkan
                                    </button>
                                  </div>
                                )}

                                {/* Option 2: Inline 1-Click Match Suggestion Badge with Copy & Locate detail */}
                                {!isMatched && suggestion && !isHighlightedCandidate && (
                                  <div className="mt-1.5 flex items-center flex-wrap gap-1.5 bg-emerald-50/90 border border-emerald-200/90 rounded-md px-2 py-1 text-[11px] shadow-2xs">
                                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-900">
                                      <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      Saran:
                                    </span>
                                    <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-[11px] shadow-2xs">
                                      <span>{suggestion.journal.voucher_code}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => handleCopyCode(suggestion.journal.voucher_code, e)}
                                        className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded transition cursor-pointer"
                                        title={copiedCode === suggestion.journal.voucher_code ? "Nomor voucher disalin!" : "Salin nomor voucher"}
                                      >
                                        {copiedCode === suggestion.journal.voucher_code ? (
                                          <Check className="w-3 h-3 text-emerald-600" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => handleLocateJournal(suggestion.journal.voucher_code, e)}
                                      className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-medium inline-flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-blue-50/70 transition cursor-pointer"
                                      title="Filter & buka rincian jurnal ini di tabel kanan"
                                    >
                                      <Search className="w-2.5 h-2.5" />
                                      Lihat Detail
                                    </button>
                                    <span className="text-[10px] font-semibold text-emerald-700 bg-white/90 px-1.5 py-0.5 rounded border border-emerald-200">
                                      {suggestion.score}% Cocok
                                    </span>
                                    <span className="text-[10px] text-slate-500 hidden sm:inline" title={suggestion.reason}>
                                      • {suggestion.reason}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApproveSingleMatch(bank, suggestion.journal);
                                      }}
                                      className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] shadow-2xs transition cursor-pointer"
                                      title={`Setujui pencocokan semi-otomatis 1-klik dengan ${suggestion.journal.voucher_code}`}
                                    >
                                      <Check className="w-3 h-3" />
                                      Setujui Match
                                    </button>
                                  </div>
                                )}

                                {!isMatched && !isPartiallyMatched && !suggestion && !isHighlightedCandidate && (
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenSplitModal(bank);
                                      }}
                                      className="text-[10px] text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded font-medium inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                                      title="Alokasikan 1 mutasi ini ke beberapa jurnal (Split Batch / Parsial)"
                                    >
                                      <GitFork className="w-3 h-3 text-indigo-600" /> Split / Alokasi
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenAdjustModal(bank);
                                      }}
                                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-0.5"
                                    >
                                      <Plus className="w-3 h-3" /> Buat Jurnal
                                    </button>
                                  </div>
                                )}

                                {!isMatched && !isPartiallyMatched && suggestion && !isHighlightedCandidate && (
                                  <div className="mt-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenSplitModal(bank);
                                      }}
                                      className="text-[10px] text-indigo-700 hover:text-indigo-900 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                                      title="Alokasikan mutasi ini ke beberapa jurnal GL sekaligus (Split Batch / Parsial)"
                                    >
                                      <GitFork className="w-2.5 h-2.5 text-indigo-600" /> Split / Alokasi
                                    </button>
                                  </div>
                                )}

                                {isPartiallyMatched && (
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenSplitModal(bank);
                                      }}
                                      className="text-[11px] text-cyan-900 hover:text-cyan-950 bg-cyan-100/90 hover:bg-cyan-200 border border-cyan-300 px-2 py-0.5 rounded font-bold inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                                      title="Lanjutkan alokasi sisa saldo mutasi ini"
                                    >
                                      <GitFork className="w-3 h-3 text-cyan-700" /> Lanjut Alokasi (Sisa {formatIDR(bank.remaining_amount ?? (bank.amount - (bank.allocated_amount || 0)))})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnmatchBank(bank);
                                      }}
                                      className="text-[10px] text-rose-600 hover:text-rose-800 hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                                      title="Rollback alokasi mutasi ini"
                                    >
                                      <RotateCcw className="w-2.5 h-2.5" />
                                      Rollback
                                    </button>
                                  </div>
                                )}

                                {isMatched && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnmatchBank(bank);
                                    }}
                                    className="text-[10px] text-rose-600 hover:text-rose-800 hover:underline font-medium inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                                    title="Batalkan rekonsiliasi / rollback mutasi ini"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    Batalkan Match
                                  </button>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-medium whitespace-nowrap">
                                <span
                                  className={
                                    bank.mutation_type === 'CR'
                                      ? 'text-emerald-700 font-semibold'
                                      : 'text-slate-800'
                                  }
                                >
                                  {bank.mutation_type === 'CR' ? '+' : '-'} {formatIDR(bank.amount)}
                                </span>
                                <div className="text-[10px] text-slate-400">
                                  {bank.mutation_type === 'CR' ? 'Kredit (Masuk)' : 'Debet (Keluar)'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                {isMatched ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <Check className="w-3 h-3" /> MATCHED
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnmatchBank(bank);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition cursor-pointer"
                                      title="Rollback mutasi ini kembali ke status UNMATCHED"
                                    >
                                      <RotateCcw className="w-2.5 h-2.5 text-rose-600" />
                                      Rollback
                                    </button>
                                  </div>
                                ) : isPartiallyMatched ? (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-300 shadow-2xs">
                                      <PieChart className="w-3 h-3 text-cyan-600" /> PARTIAL
                                    </span>
                                    <span className="text-[9px] font-mono text-cyan-800 font-semibold">
                                      Sisa: {formatIDR(bank.remaining_amount ?? (bank.amount - (bank.allocated_amount || 0)))}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnmatchBank(bank);
                                      }}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition cursor-pointer"
                                      title="Rollback mutasi ini kembali ke status UNMATCHED"
                                    >
                                      <RotateCcw className="w-2.5 h-2.5 text-rose-600" />
                                      Rollback
                                    </button>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                    UNMATCHED
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination Toolbar - Mutasi Bank */}
                <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 select-none shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      {filteredBank.length === 0 ? (
                        '0 mutasi'
                      ) : (
                        <>
                          Baris <span className="font-semibold text-slate-700">{(bankPage - 1) * bankPageSize + 1}</span>-
                          <span className="font-semibold text-slate-700">
                            {Math.min(bankPage * bankPageSize, filteredBank.length)}
                          </span>{' '}
                          dari <span className="font-semibold text-slate-700">{filteredBank.length}</span>
                        </>
                      )}
                    </span>
                    <div className="h-3 w-px bg-slate-300" />
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <span>Tampil:</span>
                      <select
                        value={bankPageSize}
                        onChange={(e) => {
                          setBankPageSize(Number(e.target.value));
                          setBankPage(1);
                        }}
                        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-700 text-[11px] font-medium focus:outline-none cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={15}>15</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setBankPage(1)}
                      disabled={bankPage <= 1}
                      title="Halaman Pertama"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setBankPage((p) => Math.max(1, p - 1))}
                      disabled={bankPage <= 1}
                      title="Halaman Sebelumnya"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <span className="px-2 text-[11px] font-mono text-slate-700">
                      Hal <span className="font-bold">{bankPage}</span> / {bankTotalPages}
                    </span>

                    <button
                      onClick={() => setBankPage((p) => Math.min(bankTotalPages, p + 1))}
                      disabled={bankPage >= bankTotalPages}
                      title="Halaman Berikutnya"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setBankPage(bankTotalPages)}
                      disabled={bankPage >= bankTotalPages}
                      title="Halaman Terakhir"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* ==================== RIGHT: GENERAL LEDGER (GL) JOURNALS ==================== */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[640px] overflow-hidden">
                {/* Table Control Bar */}
                <div className="p-3.5 border-b border-slate-200 bg-slate-50/60 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Buku Kas GL ({journalAccountFilter === 'ALL' ? 'Semua Rekening' : journalAccountFilter})
                      </h2>
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                        {filteredJournal.length}
                      </span>
                    </div>

                    {/* Segmented Control with Soft Modern Badges */}
                    <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200/80 text-xs font-medium text-slate-600 gap-0.5">
                      <button
                        onClick={() => setJournalTab('ALL')}
                        className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                          journalTab === 'ALL'
                            ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                            : 'hover:text-slate-900 text-slate-600'
                        }`}
                      >
                        <span>Semua</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                            journalTab === 'ALL'
                              ? 'bg-slate-200 text-slate-800'
                              : 'bg-slate-200/70 text-slate-600'
                          }`}
                        >
                          {journalCounts.all}
                        </span>
                      </button>
                      <button
                        onClick={() => setJournalTab('UNMATCHED')}
                        className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                          journalTab === 'UNMATCHED'
                            ? 'bg-white text-amber-900 shadow-2xs font-semibold'
                            : 'hover:text-slate-900 text-slate-600'
                        }`}
                      >
                        <span>Belum Kliring</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                            journalTab === 'UNMATCHED'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200/60'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {journalCounts.unmatched}
                        </span>
                      </button>
                      <button
                        onClick={() => setJournalTab('MATCHED')}
                        className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 cursor-pointer ${
                          journalTab === 'MATCHED'
                            ? 'bg-white text-emerald-900 shadow-2xs font-semibold'
                            : 'hover:text-slate-900 text-slate-600'
                        }`}
                      >
                        <span>Sudah Kliring</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                            journalTab === 'MATCHED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/60'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          {journalCounts.matched}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Account Quick Filter Bar */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70">
                    <div className="flex items-center gap-1.5 overflow-x-auto text-xs py-0.5 min-w-0">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-slate-400" />
                        Akun GL:
                      </span>
                      <select
                        value={journalAccountFilter}
                        onChange={(e) => {
                          const selectedCode = e.target.value;
                          setJournalAccountFilter(selectedCode);
                          if (selectedCode === 'ALL') {
                            setBankAccountFilter('ALL');
                            setSession(SESSIONS_BY_ACCOUNT['ALL'] || INITIAL_SESSION);
                          } else {
                            const acc = MOCK_BANK_ACCOUNTS.find((a) => a.account_code === selectedCode);
                            if (acc) {
                              setBankFilter(acc.bank_code);
                              setBankAccountFilter(acc.account_number);
                              if (SESSIONS_BY_ACCOUNT[acc.account_number]) {
                                setSession(SESSIONS_BY_ACCOUNT[acc.account_number]);
                              }
                            }
                          }
                          setSelectedBankIds([]);
                          setSelectedJournalIds([]);
                        }}
                        className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-700 font-medium focus:outline-none cursor-pointer max-w-[170px] sm:max-w-[200px] truncate"
                      >
                        <option value="ALL">🏢 Semua Rekening GL (Konsolidasi)</option>
                        {MOCK_BANK_ACCOUNTS.map((acc) => (
                          <option key={acc.id} value={acc.account_code}>
                            {acc.account_code} &bull; {acc.account_name}
                          </option>
                        ))}
                      </select>

                      <div className="h-3.5 w-px bg-slate-200 shrink-0 mx-1" />

                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        Periode:
                      </span>
                      <select
                        value={periodFilter}
                        onChange={(e) => setPeriodFilter(e.target.value)}
                        className="text-[11px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-700 font-medium focus:outline-none cursor-pointer max-w-[130px] sm:max-w-[150px] truncate"
                      >
                        <option value="ALL">🗓️ Semua Periode (2026)</option>
                        <option value="2026-10">📌 Oktober 2026 (Aktif)</option>
                        <option value="2026-11">November 2026</option>
                        <option value="2026-12">Desember 2026</option>
                        <option value="2026-09">September 2026</option>
                        <option value="2026-08">Agustus 2026</option>
                        <option value="2026-07">Juli 2026</option>
                        <option value="2026-06">Juni 2026</option>
                        <option value="2026-05">Mei 2026</option>
                        <option value="2026-04">April 2026</option>
                        <option value="2026-03">Maret 2026</option>
                        <option value="2026-02">Februari 2026</option>
                        <option value="2026-01">Januari 2026</option>
                      </select>
                    </div>

                    <span className="text-[10px] text-slate-600 font-mono font-medium px-2 py-0.5 rounded bg-slate-100 border border-slate-200 shrink-0 whitespace-nowrap">
                      {filteredJournal.length} voucher
                    </span>
                  </div>
                </div>

                {/* Prominent Search Textbox Bar */}
                <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-50/70">
                  <div className="relative flex items-center bg-white border border-slate-300 rounded-lg shadow-2xs px-2.5 py-1.5 focus-within:border-slate-800 focus-within:ring-2 focus-within:ring-slate-900/10 transition">
                    <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
                    <input
                      type="text"
                      placeholder="Cari voucher jurnal, keterangan, akun, nominal (misal: 22.000.000)..."
                      value={searchJournal}
                      onChange={(e) => setSearchJournal(e.target.value)}
                      className="w-full text-xs text-slate-800 placeholder-slate-400 bg-transparent focus:outline-none"
                    />
                    {searchJournal && (
                      <button
                        onClick={() => setSearchJournal('')}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition shrink-0 ml-1 cursor-pointer"
                        title="Hapus pencarian"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Dense Financial Table */}
                <div className="flex-1 overflow-auto">
                  {filteredJournal.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <FileText className="w-6 h-6 mb-2 opacity-25" />
                      <p className="text-xs font-semibold text-slate-600">Tidak ada voucher jurnal</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-xs">
                        Tidak ditemukan voucher jurnal yang sesuai dengan filter atau kata kunci pencarian.
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 font-semibold text-[11px]">
                        <tr>
                          <th className="w-12 py-2.5 px-2 text-center">#</th>
                          <th className="py-2.5 px-2">Tanggal &amp; Voucher</th>
                          <th className="py-2.5 px-2">Keterangan Jurnal</th>
                          <th className="py-2.5 px-3 text-right">Debit / Kredit (IDR)</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {paginatedJournalLines.map((journal) => {
                          const isSelected = selectedJournalIds.includes(journal.id);
                          const isMatched = journal.is_reconciled;
                          const isExpanded = expandedJournalIds.includes(journal.id);
                          const isHighlightedCandidate = recommendedJournalIdsForSelectedBank.includes(journal.id);

                          // Resolve double-entry line details
                          const getDetailLines = () => {
                            if (journal.lines && journal.lines.length > 0) {
                              return journal.lines;
                            }
                            const mockMatch = MOCK_TRANSACTION_JOURNALS.find(
                              (m) => m.voucher_code === journal.voucher_code
                            );
                            if (mockMatch && mockMatch.lines && mockMatch.lines.length > 0) {
                              return mockMatch.lines;
                            }
                            const isCredit = journal.type === 'CR';
                            return [
                              {
                                id: 1,
                                line_no: 1,
                                account_code: journal.account_code || '111-201',
                                account_name: journal.account_name || 'Bank Mandiri Giro Operasional',
                                line_description: journal.description,
                                debit_amount: isCredit ? journal.amount : 0,
                                credit_amount: isCredit ? 0 : journal.amount,
                                is_reconciled: journal.is_reconciled,
                              },
                              {
                                id: 2,
                                line_no: 2,
                                account_code: isCredit ? '112-100' : '211-100',
                                account_name: isCredit ? 'Piutang Usaha Pelanggan' : 'Hutang Usaha Pemasok / Vendor',
                                line_description: `Akun Lawan: ${journal.description}`,
                                debit_amount: isCredit ? 0 : journal.amount,
                                credit_amount: isCredit ? journal.amount : 0,
                                is_reconciled: false,
                              },
                            ];
                          };

                          const detailLines = isExpanded ? getDetailLines() : [];

                          return (
                            <React.Fragment key={journal.id}>
                              <tr
                                onClick={() => {
                                  if (isMatched) return;
                                  setSelectedJournalIds((prev) =>
                                    isSelected ? prev.filter((id) => id !== journal.id) : [...prev, journal.id]
                                  );
                                }}
                                className={`transition cursor-pointer select-none ${isSelected
                                    ? 'bg-blue-50/80 ring-2 ring-blue-500'
                                    : isHighlightedCandidate
                                      ? 'bg-emerald-50/80 ring-2 ring-emerald-500/80 border-emerald-300'
                                      : isMatched
                                        ? 'bg-slate-50/50 text-slate-400 cursor-default'
                                        : 'hover:bg-slate-50'
                                  } ${isExpanded ? 'border-b border-slate-200/50 bg-slate-50/40' : ''}`}
                              >
                                <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => toggleExpandJournal(journal.id, e)}
                                      className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/70 rounded transition cursor-pointer"
                                      title={isExpanded ? 'Tutup rincian baris jurnal' : 'Buka rincian baris jurnal (transaction_journal_line)'}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5 text-slate-800" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                      )}
                                    </button>
                                    <input
                                      type="checkbox"
                                      checked={isSelected || isMatched}
                                      disabled={isMatched}
                                      onChange={() => {
                                        if (isMatched) return;
                                        setSelectedJournalIds((prev) =>
                                          isSelected ? prev.filter((id) => id !== journal.id) : [...prev, journal.id]
                                        );
                                      }}
                                      className="rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer disabled:cursor-default"
                                    />
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 font-mono text-[11px] whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-slate-800">{journal.transaction_date}</span>
                                    <span className="text-[9px] font-sans font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      {journal.period_name ? journal.period_name.slice(0, 3) + ' ' + journal.transaction_date.slice(0, 4) : journal.transaction_date.slice(0, 7)}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1">
                                    <span>{journal.voucher_code}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => handleCopyCode(journal.voucher_code, e)}
                                      className="p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded transition cursor-pointer"
                                      title={copiedCode === journal.voucher_code ? "Nomor voucher disalin!" : "Salin nomor voucher"}
                                    >
                                      {copiedCode === journal.voucher_code ? (
                                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-2.5 h-2.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2.5 px-2 min-w-[220px] max-w-[440px]">
                                  <div className="flex items-center gap-1.5">
                                    {journal.account_code && (
                                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-slate-200 bg-slate-100 text-slate-700 shrink-0">
                                        {journal.account_code}
                                      </span>
                                    )}
                                    <div className="truncate font-medium text-slate-800" title={journal.description}>
                                      {journal.description}
                                    </div>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate">
                                    {journal.account_name}
                                  </div>

                                  {/* Option 1: Selected candidate highlight feedback */}
                                  {isHighlightedCandidate && !isSelected && activeSelectedBank && (
                                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        <Sparkles className="w-3 h-3 text-emerald-600 animate-pulse" />
                                        Rekomendasi Cocok: {activeSelectedBank.bank_reference_no} (Selisih Rp 0)
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => handleCopyCode(activeSelectedBank.bank_reference_no, e)}
                                        className="p-1 text-slate-500 hover:text-slate-800 hover:bg-emerald-200/60 rounded transition cursor-pointer"
                                        title={copiedCode === activeSelectedBank.bank_reference_no ? "Disalin!" : "Salin nomor referensi"}
                                      >
                                        {copiedCode === activeSelectedBank.bank_reference_no ? (
                                          <Check className="w-3 h-3 text-emerald-600" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleApproveSingleMatch(activeSelectedBank, journal);
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[10px] shadow-2xs transition cursor-pointer"
                                      >
                                        <Check className="w-3 h-3" />
                                        Pasangkan
                                      </button>
                                    </div>
                                  )}

                                  {isMatched && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnmatchJournal(journal);
                                      }}
                                      className="text-[10px] text-rose-600 hover:text-rose-800 hover:underline font-medium inline-flex items-center gap-1 mt-0.5 cursor-pointer"
                                      title="Batalkan rekonsiliasi / rollback voucher ini"
                                    >
                                      <RotateCcw className="w-2.5 h-2.5" />
                                      Batalkan Match
                                    </button>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-medium whitespace-nowrap">
                                  <span
                                    className={
                                      journal.type === 'CR'
                                        ? 'text-emerald-700 font-semibold'
                                        : 'text-slate-800'
                                    }
                                  >
                                    {journal.type === 'CR' ? '+' : '-'} {formatIDR(journal.amount)}
                                  </span>
                                  <div className="text-[10px] text-slate-400">
                                    {journal.type === 'CR' ? 'Kas Masuk (Debit)' : 'Kas Keluar (Kredit)'}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {isMatched ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <Check className="w-3 h-3" /> KLIRING
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleUnmatchJournal(journal);
                                        }}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition cursor-pointer"
                                        title="Rollback voucher ini kembali ke status Belum Kliring"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5 text-rose-600" />
                                        Rollback
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                      PENDING
                                    </span>
                                  )}
                                </td>
                              </tr>

                              {/* Collapsible Line Items Detail Accordion (transaction_journal_line) */}
                              {isExpanded && (
                                <tr className="bg-slate-50/90 border-b border-slate-200">
                                  <td colSpan={5} className="p-3 pl-8">
                                    <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs space-y-2">
                                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-[11px]">
                                        <div className="flex items-center gap-2">
                                          <FileText className="w-3.5 h-3.5 text-slate-500" />
                                          <span className="font-bold text-slate-800 uppercase tracking-wide">
                                            Rincian Double-Entry Jurnal ({journal.voucher_code})
                                          </span>
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono font-semibold">
                                            {detailLines.length} Baris Akun
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-slate-500 truncate max-w-xs" title={journal.description}>
                                            Keterangan: <strong className="text-slate-700">{journal.description}</strong>
                                          </span>
                                          {isMatched && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleUnmatchJournal(journal);
                                              }}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 shadow-2xs transition cursor-pointer"
                                              title="Batalkan rekonsiliasi dan kembalikan ke status Belum Kliring"
                                            >
                                              <RotateCcw className="w-2.5 h-2.5 text-rose-600" />
                                              Rollback Jurnal Ini
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      <table className="w-full text-left text-[11px] border-collapse bg-white rounded border border-slate-200 overflow-hidden">
                                        <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold text-[10px]">
                                          <tr>
                                            <th className="py-1 px-2.5 text-center w-8">#</th>
                                            <th className="py-1 px-2.5">Akun GL (COA)</th>
                                            <th className="py-1 px-2.5">Keterangan Baris Transaksi</th>
                                            <th className="py-1 px-2.5 text-right">Debit (IDR)</th>
                                            <th className="py-1 px-2.5 text-right">Kredit (IDR)</th>
                                            <th className="py-1 px-2.5 text-center">Status Rekonsiliasi Bank</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-slate-700">
                                          {detailLines.map((l) => (
                                            <tr key={l.id} className="hover:bg-slate-50/70">
                                              <td className="py-1.5 px-2.5 text-center font-mono text-slate-400">
                                                {l.line_no}
                                              </td>
                                              <td className="py-1.5 px-2.5 whitespace-nowrap">
                                                <span className="font-mono font-bold text-slate-900">{l.account_code}</span>
                                                <span className="text-slate-500 ml-1.5 font-medium">{l.account_name}</span>
                                              </td>
                                              <td className="py-1.5 px-2.5 text-slate-600 max-w-[220px] truncate" title={l.line_description}>
                                                {l.line_description}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-slate-900">
                                                {l.debit_amount > 0 ? formatIDR(l.debit_amount) : '-'}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-slate-900">
                                                {l.credit_amount > 0 ? formatIDR(l.credit_amount) : '-'}
                                              </td>
                                              <td className="py-1.5 px-2.5 text-center">
                                                {l.account_code.startsWith('111-') ? (
                                                  journal.is_reconciled ? (
                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                      <Check className="w-2.5 h-2.5" /> Kliring Bank
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                      <Clock className="w-2.5 h-2.5" /> Pending Kliring
                                                    </span>
                                                  )
                                                ) : (
                                                  <span className="text-slate-400 text-[9px] font-mono">
                                                    Akun Lawan (Non-Bank)
                                                  </span>
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                          {/* Total Balance Check */}
                                          <tr className="bg-slate-100/50 font-semibold border-t border-slate-200 text-slate-900 text-[10px]">
                                            <td colSpan={3} className="py-1.5 px-2.5 text-right uppercase tracking-wider text-slate-500">
                                              Total Debit &amp; Kredit (Balance Check):
                                            </td>
                                            <td className="py-1.5 px-2.5 text-right font-mono text-emerald-700">
                                              Rp {formatIDR(journal.amount)}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-right font-mono text-emerald-700">
                                              Rp {formatIDR(journal.amount)}
                                            </td>
                                            <td className="py-1.5 px-2.5 text-center text-emerald-700 font-bold text-[9px]">
                                              ✓ SEIMBANG
                                            </td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination Toolbar - Jurnal GL */}
                <div className="px-3.5 py-2 border-t border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 select-none shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">
                      {filteredJournal.length === 0 ? (
                        '0 voucher'
                      ) : (
                        <>
                          Baris <span className="font-semibold text-slate-700">{(journalPage - 1) * journalPageSize + 1}</span>-
                          <span className="font-semibold text-slate-700">
                            {Math.min(journalPage * journalPageSize, filteredJournal.length)}
                          </span>{' '}
                          dari <span className="font-semibold text-slate-700">{filteredJournal.length}</span>
                        </>
                      )}
                    </span>
                    <div className="h-3 w-px bg-slate-300" />
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <span>Tampil:</span>
                      <select
                        value={journalPageSize}
                        onChange={(e) => {
                          setJournalPageSize(Number(e.target.value));
                          setJournalPage(1);
                        }}
                        className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-slate-700 text-[11px] font-medium focus:outline-none cursor-pointer"
                      >
                        <option value={10}>10</option>
                        <option value={15}>15</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setJournalPage(1)}
                      disabled={journalPage <= 1}
                      title="Halaman Pertama"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setJournalPage((p) => Math.max(1, p - 1))}
                      disabled={journalPage <= 1}
                      title="Halaman Sebelumnya"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    <span className="px-2 text-[11px] font-mono text-slate-700">
                      Hal <span className="font-bold">{journalPage}</span> / {journalTotalPages}
                    </span>

                    <button
                      onClick={() => setJournalPage((p) => Math.min(journalTotalPages, p + 1))}
                      disabled={journalPage >= journalTotalPages}
                      title="Halaman Berikutnya"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setJournalPage(journalTotalPages)}
                      disabled={journalPage >= journalTotalPages}
                      title="Halaman Terakhir"
                      className="p-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
      </div>


      {/* Floating Action Ribbon for Matching Selected Items */}
      {(selectedBankIds.length > 0 || selectedJournalIds.length > 0) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-xl shadow-xl px-5 py-3 flex items-center gap-5 max-w-2xl w-full border border-slate-800 animate-in slide-in-from-bottom-4 no-print">
          <div className="flex-1 grid grid-cols-2 divide-x divide-slate-800 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">
                {selectedBankIds.length} Mutasi Bank:
              </span>
              <span className="font-mono font-bold text-sm">
                Rp {formatIDR(selectedBankTotal)}
              </span>
            </div>
            <div className="pl-4">
              <span className="text-slate-400 block text-[11px]">
                {selectedJournalIds.length} Jurnal GL:
              </span>
              <span className="font-mono font-bold text-sm">
                Rp {formatIDR(selectedJournalTotal)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block">Selisih:</span>
              <span
                className={`font-mono text-xs font-bold ${canMatchSelected ? 'text-emerald-400' : 'text-rose-400'
                  }`}
              >
                Rp {formatIDR(Math.abs(selectedBankTotal - selectedJournalTotal))}
              </span>
            </div>

            {canMatchSelected ? (
              <button
                onClick={handleMatchSelected}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-950 hover:bg-slate-100 transition shadow-sm cursor-pointer"
              >
                Cocokkan (Match)
              </button>
            ) : selectedBankIds.length === 1 &&
              selectedJournalIds.length === 0 &&
              recommendedJournalIdsForSelectedBank.length > 0 ? (
              <button
                onClick={() => {
                  const targetJ = journalLines.find(
                    (j) => j.id === recommendedJournalIdsForSelectedBank[0]
                  );
                  if (activeSelectedBank && targetJ) {
                    handleApproveSingleMatch(activeSelectedBank, targetJ);
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Pasangkan otomatis dengan rekomendasi voucher jurnal GL"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                Pasangkan Otomatis
              </button>
            ) : selectedJournalIds.length === 1 &&
              selectedBankIds.length === 0 &&
              recommendedBankIdsForSelectedJournal.length > 0 ? (
              <button
                onClick={() => {
                  const targetB = bankLines.find(
                    (b) => b.id === recommendedBankIdsForSelectedJournal[0]
                  );
                  if (activeSelectedJournal && targetB) {
                    handleApproveSingleMatch(targetB, activeSelectedJournal);
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                title="Pasangkan otomatis dengan rekomendasi mutasi rekening koran"
              >
                <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                Pasangkan Otomatis
              </button>
            ) : (
              <button
                disabled
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-slate-950 transition opacity-30 cursor-not-allowed"
              >
                Cocokkan (Match)
              </button>
            )}

            <button
              onClick={() => {
                setSelectedBankIds([]);
                setSelectedJournalIds([]);
              }}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
              title="Batal pilih"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal: Interactive Split & Partial Allocation (Skenario A & Skenario B) */}
      {showSplitModal && splitTargetBank && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full my-auto shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                    <GitFork className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      Split &amp; Alokasi Jurnal Rekonsiliasi
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        1 Mutasi → N Jurnal
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Kombinasi <strong className="text-slate-700">Skenario A</strong> (Split Batch Kliring Penuh) &amp; <strong className="text-slate-700">Skenario B</strong> (Alokasi Parsial Bertahap).
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSplitModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Target Mutation Info Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Target Mutasi:</span>
                    <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {splitTargetBank.bank_reference_no}
                    </span>
                    {splitTargetBank.bank_code && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        {splitTargetBank.bank_code} {splitTargetBank.account_number ? `• ${splitTargetBank.account_number}` : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 font-mono">
                    Tanggal: <span className="font-semibold text-slate-800">{splitTargetBank.transaction_date}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-700 flex items-center justify-between gap-2">
                  <div className="truncate max-w-xl">
                    <span className="text-slate-500">Keterangan:</span>{' '}
                    <span className="font-medium text-slate-900">{splitTargetBank.description}</span>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {splitTargetBank.mutation_type === 'CR' ? 'Kredit (Dana Masuk)' : 'Debet (Dana Keluar)'}
                  </span>
                </div>

                {/* 3 Metric Summary Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Target Kliring Mutasi
                    </div>
                    <div className="text-base font-mono font-bold text-slate-900 mt-0.5">
                      Rp {formatIDR(splitTargetBalanceToClear)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {splitTargetBank.allocated_amount && splitTargetBank.allocated_amount > 0 ? (
                        <span className="text-cyan-700">
                          Total Rp {formatIDR(splitTargetBank.amount)} (Teralokasi Rp {formatIDR(splitTargetBank.allocated_amount)})
                        </span>
                      ) : (
                        `Nominal Total: Rp ${formatIDR(splitTargetBank.amount)}`
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-lg border border-slate-200">
                    <div className="text-[11px] font-semibold text-indigo-600 uppercase tracking-wider">
                      Total Jurnal Dipilih
                    </div>
                    <div className="text-base font-mono font-bold text-indigo-700 mt-0.5">
                      Rp {formatIDR(splitSelectedTotal)}
                    </div>
                    <div className="text-[10px] text-indigo-600/80 mt-0.5 font-medium">
                      {splitSelectedJournalIds.length} Jurnal GL Tercentang
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-lg border transition ${splitRemainingAfter === 0 && splitSelectedTotal > 0
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : splitRemainingAfter > 0 && splitSelectedTotal > 0
                          ? 'bg-cyan-50 border-cyan-300 text-cyan-900'
                          : splitRemainingAfter < 0
                            ? 'bg-rose-50 border-rose-300 text-rose-900'
                            : 'bg-white border-slate-200 text-slate-800'
                      }`}
                  >
                    <div className="text-[11px] font-semibold uppercase tracking-wider">
                      Sisa Saldo Terbuka
                    </div>
                    <div className="text-base font-mono font-bold mt-0.5">
                      Rp {formatIDR(Math.abs(splitRemainingAfter))}
                    </div>
                    <div className="text-[10px] font-semibold mt-0.5">
                      {splitRemainingAfter === 0 && splitSelectedTotal > 0 ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Skenario A (Split Batch Rp 0)
                        </span>
                      ) : splitRemainingAfter > 0 && splitSelectedTotal > 0 ? (
                        <span className="text-cyan-700 flex items-center gap-1">
                          <PieChart className="w-3 h-3" /> Skenario B (Alokasi Parsial)
                        </span>
                      ) : splitRemainingAfter < 0 ? (
                        <span className="text-rose-700">
                          ⚠️ Melebihi Nominal Mutasi!
                        </span>
                      ) : (
                        <span className="text-slate-500">Pilih jurnal di bawah</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Candidate Jurnal GL Table Selection */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Pilih Jurnal GL Kas / Bank ({splitCandidateJournals.length} Tersedia)
                    </h4>
                    <span className="text-[10px] text-slate-500">
                      (Arah Kas:{' '}
                      <strong className="text-slate-700">
                        {splitTargetBank.mutation_type === 'CR' ? 'Kas Masuk / BKM' : 'Kas Keluar / BKK'}
                      </strong>
                      )
                    </span>
                  </div>

                  {/* Search Candidate */}
                  <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={splitSearch}
                      onChange={(e) => setSplitSearch(e.target.value)}
                      placeholder="Cari voucher, invoice, mitra..."
                      className="w-full pl-8 pr-3 py-1 bg-white border border-slate-300 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* Candidate Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[36vh] overflow-y-auto">
                  {splitCandidateJournals.length === 0 ? (
                    <div className="py-8 text-center text-slate-500 text-xs">
                      Tidak ada jurnal GL yang belum direkonsiliasi dengan arah kas yang sama.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 font-semibold text-[11px]">
                        <tr>
                          <th className="w-8 py-2 px-3 text-center">#</th>
                          <th className="py-2 px-2">Tanggal &amp; No. Voucher</th>
                          <th className="py-2 px-2">Deskripsi &amp; Rekanan</th>
                          <th className="py-2 px-2">Akun GL</th>
                          <th className="py-2 px-3 text-right">Nominal Jurnal (IDR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {splitCandidateJournals.map((journal) => {
                          const isChecked = splitSelectedJournalIds.includes(journal.id);
                          return (
                            <tr
                              key={journal.id}
                              onClick={() => handleToggleSplitJournal(journal.id)}
                              className={`transition cursor-pointer select-none ${isChecked
                                  ? 'bg-indigo-50/90 font-medium'
                                  : 'hover:bg-slate-50'
                                }`}
                            >
                              <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleSplitJournal(journal.id)}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                                />
                              </td>
                              <td className="py-2 px-2 font-mono text-[11px] whitespace-nowrap">
                                <div className="text-slate-800 font-semibold flex items-center gap-1">
                                  <span>{journal.voucher_code}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopyCode(journal.voucher_code, e)}
                                    className="p-0.5 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                                    title={copiedCode === journal.voucher_code ? "Disalin!" : "Salin nomor voucher"}
                                  >
                                    {copiedCode === journal.voucher_code ? (
                                      <Check className="w-2.5 h-2.5 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-2.5 h-2.5" />
                                    )}
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-400">{journal.transaction_date}</div>
                              </td>
                              <td className="py-2 px-2">
                                <div className="text-slate-800 line-clamp-1" title={journal.description}>
                                  {journal.description}
                                </div>
                                {(journal.partner_name || journal.invoice_no) && (
                                  <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                    {journal.partner_name && (
                                      <span className="font-medium text-slate-700">{journal.partner_name}</span>
                                    )}
                                    {journal.invoice_no && (
                                      <span className="font-mono text-slate-500">({journal.invoice_no})</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 font-mono text-[11px] whitespace-nowrap text-slate-600">
                                <div>{journal.account_code}</div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={journal.account_name}>
                                  {journal.account_name}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">
                                <span className={journal.type === 'CR' ? 'text-emerald-700' : 'text-slate-800'}>
                                  Rp {formatIDR(journal.amount)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-600">
                {splitSelectedJournalIds.length === 0 ? (
                  <span>Centang satu atau lebih jurnal GL di atas untuk mengalokasikan mutasi ini.</span>
                ) : splitRemainingAfter === 0 ? (
                  <span className="text-emerald-800 font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <strong>Skenario A Siap:</strong> Kliring penuh 100% (Selisih Rp 0). Mutasi akan ditandai MATCHED.
                  </span>
                ) : splitRemainingAfter > 0 ? (
                  <span className="text-cyan-800 font-semibold flex items-center gap-1.5">
                    <PieChart className="w-4 h-4 text-cyan-600" />
                    <strong>Skenario B Siap:</strong> Alokasi parsial. Mutasi bank akan ditandai PARTIALLY_MATCHED dengan sisa saldo terbuka Rp {formatIDR(splitRemainingAfter)}.
                  </span>
                ) : (
                  <span className="text-rose-700 font-semibold flex items-center gap-1.5">
                    ⚠️ Total jurnal melebihi nominal mutasi sebesar Rp {formatIDR(Math.abs(splitRemainingAfter))}.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSplitModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="button"
                  disabled={splitSelectedJournalIds.length === 0 || splitRemainingAfter < 0}
                  onClick={handleExecuteSplitMatch}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${splitRemainingAfter === 0
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-cyan-700 hover:bg-cyan-800 text-white'
                    }`}
                >
                  {splitRemainingAfter === 0 ? (
                    <>
                      <Check className="w-4 h-4" />
                      Selesaikan Match Penuh (Split Batch Rp 0)
                    </>
                  ) : (
                    <>
                      <PieChart className="w-4 h-4" />
                      Simpan Alokasi Parsial (Sisa Rp {formatIDR(Math.max(0, splitRemainingAfter))})
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Instant Adjusting Journal */}
      {showAdjustModal && targetBankLine && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Buat Jurnal Penyesuaian Kas / Bank
              </h3>
              <button onClick={() => setShowAdjustModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="text-slate-500">Mutasi Rekening Koran:</div>
              <div className="font-semibold text-slate-900">{targetBankLine.description}</div>
              <div className="font-mono font-bold text-slate-900">
                Rp {formatIDR(targetBankLine.amount)} ({targetBankLine.mutation_type === 'CR' ? 'Uang Masuk' : 'Uang Keluar'})
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Akun Lawan (Offset GL Account):
                </label>
                <select
                  value={adjustAccountCode}
                  onChange={(e) => setAdjustAccountCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="112-100">112-100 &bull; Piutang Usaha Pelanggan (Transfer Masuk)</option>
                  <option value="411-100">411-100 &bull; Pendapatan Operasional Lain-lain</option>
                  <option value="610-100">610-100 &bull; Beban Administrasi Bank</option>
                  <option value="421-100">421-100 &bull; Pendapatan Bunga Jasa Giro</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Keterangan Voucher Jurnal:
                </label>
                <input
                  type="text"
                  value={adjustDescription}
                  onChange={(e) => setAdjustDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-md p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowAdjustModal(false)}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                onClick={handleSaveAdjustJournal}
                className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white"
              >
                Post Jurnal &amp; Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Official Bank Reconciliation Report (PDF Printable) */}
      {showReportModal && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowReportModal(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm overflow-y-auto p-3 sm:p-6 sm:py-8 flex justify-center items-start modal-backdrop-print"
        >
          {/* Floating High-Z Index Close Button (Always visible on screen) */}
          <button
            type="button"
            onClick={() => setShowReportModal(false)}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 z-60 bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-2 rounded-full shadow-2xl border border-slate-700/60 cursor-pointer print:hidden no-print transition hover:scale-105 flex items-center gap-1.5 text-xs font-bold"
            title="Tutup Modal (Tekan Esc)"
          >
            <X className="w-4 h-4" />
            <span>Tutup (Esc)</span>
          </button>

          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 sm:p-10 space-y-6 shadow-2xl my-4 sm:my-6 border border-slate-200 modal-content-print print-exact relative">
            {/* Print Action Ribbon (Sticky so it stays visible while scrolling) */}
            <div className="sticky -top-6 sm:-top-10 bg-white/95 backdrop-blur-xs z-20 pt-3 pb-3.5 -mx-6 sm:-mx-10 px-6 sm:px-10 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 print:hidden no-print shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                  DOKUMEN RESMI A4
                </span>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeReportSchedule}
                    onChange={(e) => setIncludeReportSchedule(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-0 cursor-pointer"
                  />
                  <span>Sertakan Lampiran Rincian Transaksi Belum Kliring</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                  title="Buka dialog cetak browser (pilih 'Save as PDF' untuk menyimpan berkas PDF)"
                >
                  <Printer className="w-3.5 h-3.5" /> Cetak / Unduh PDF (A4)
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-3 py-2 rounded-lg text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                  title="Tutup Modal"
                >
                  <X className="w-4 h-4" /> Tutup
                </button>
              </div>
            </div>

            {/* Corporate Kop Surat Resmi (Official Letterhead) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                    NGM
                  </div>
                  <div>
                    <h1 className="text-base font-extrabold text-slate-900 tracking-tight leading-none uppercase">
                      PT Nusantara Global Mandiri
                    </h1>
                    <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                      Sistem Keuangan Terpadu &bull; Gemoy ERP Cash &amp; Bank Division
                    </p>
                  </div>
                </div>
                <div className="text-right text-[10px] text-slate-500 font-mono hidden sm:block">
                  <div>SK Kemenkumham: AHU-0019284.AH.01.01</div>
                  <div>NPWP: 01.884.291.4-012.000</div>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 leading-tight pt-1">
                Gedung Bursa Efek Indonesia, Tower 2, Lt. 18, Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan 12190 &bull; Telp: (021) 515-2888 &bull; Email: finance@nusantaraglobal.co.id
              </div>

              {/* Double Line Header Rule */}
              <div className="pt-1.5">
                <div className="border-b-2 border-slate-900" />
                <div className="border-b border-slate-300 mt-0.5" />
              </div>
            </div>

            {/* Document Title & Official Metadata */}
            <div className="space-y-3">
              <div className="text-center pt-1">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-wide">
                  Berita Acara Rekonsiliasi Kas &amp; Bank
                </h2>
                <p className="text-[11px] text-slate-500 italic">
                  Official Bank Reconciliation Statement &amp; Certificate of Balance
                </p>
              </div>

              {/* Metadata Grid */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 font-sans">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">No. Dokumen</span>
                  <span className="font-mono font-bold text-slate-900">
                    BA-RECON/NGM/2026/10/{bankAccountFilter !== 'ALL' ? bankAccountFilter.slice(-3) : 'KONS'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Periode Fiskal</span>
                  <span className="font-semibold text-slate-900">
                    {periodFilter !== 'ALL' ? periodFilter : session.period_name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Rekening Bank</span>
                  <span className="font-semibold text-slate-900 truncate block" title={session.account_number}>
                    {bankAccountFilter !== 'ALL' ? `${bankAccountFilter} (${session.bank_name})` : 'Konsolidasi Semua Bank'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Tanggal Cetak</span>
                  <span className="font-medium text-slate-900">
                    {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Executive 2-Column Comparative Reconciliation Table */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between border-b pb-1">
                <span>Ikhtisar Saldo yang Disesuaikan (Two-Column Method PSAK 2)</span>
                <span className="text-[10px] text-slate-500 font-mono">Mata Uang: IDR</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Kolom 1: Bank Statement */}
                <div className="border border-slate-200 rounded-lg p-3.5 space-y-2.5 bg-white">
                  <div className="font-bold text-slate-900 border-b pb-1.5 flex items-center justify-between">
                    <span>1. POSISI REKENING KORAN (BANK)</span>
                    <span className="text-[10px] font-mono font-medium text-slate-500">Kredit = Masuk</span>
                  </div>

                  <div className="flex justify-between font-mono py-1">
                    <span className="text-slate-700">Saldo Akhir Rekening Koran:</span>
                    <span className="font-bold text-slate-900">Rp {formatIDR(stats.bankEnding)}</span>
                  </div>

                  <div className="flex justify-between font-mono text-slate-600 text-[11px]">
                    <span>(+) Setoran dalam Proses (Deposits in Transit):</span>
                    <span className="text-emerald-700 font-medium">+ Rp {formatIDR(stats.depositsInTransit)}</span>
                  </div>

                  <div className="flex justify-between font-mono text-slate-600 text-[11px]">
                    <span>(-) Cek Beredar (Outstanding Checks):</span>
                    <span className="text-rose-700 font-medium">- Rp {formatIDR(stats.outstandingDisbursements)}</span>
                  </div>

                  <div className="border-t border-slate-300 pt-2 flex justify-between font-mono font-bold text-slate-900 bg-slate-50 -mx-3.5 -mb-3.5 p-3 rounded-b-lg">
                    <span>SALDO BANK DISESUAIKAN:</span>
                    <span className="text-slate-900 text-sm">Rp {formatIDR(stats.adjustedBank)}</span>
                  </div>
                </div>

                {/* Kolom 2: General Ledger */}
                <div className="border border-slate-200 rounded-lg p-3.5 space-y-2.5 bg-white">
                  <div className="font-bold text-slate-900 border-b pb-1.5 flex items-center justify-between">
                    <span>2. POSISI BUKU BESAR UMUM (ERP GL)</span>
                    <span className="text-[10px] font-mono font-medium text-slate-500">Debet = Masuk</span>
                  </div>

                  <div className="flex justify-between font-mono py-1">
                    <span className="text-slate-700">Saldo Akhir Buku Kas GL:</span>
                    <span className="font-bold text-slate-900">Rp {formatIDR(stats.glEnding)}</span>
                  </div>

                  <div className="flex justify-between font-mono text-slate-600 text-[11px]">
                    <span>(+) Penerimaan/Kredit Belum Dijurnal:</span>
                    <span className="text-emerald-700 font-medium">+ Rp {formatIDR(stats.unrecordedCredits)}</span>
                  </div>

                  <div className="flex justify-between font-mono text-slate-600 text-[11px]">
                    <span>(-) Biaya Bank/Debet Belum Dijurnal:</span>
                    <span className="text-rose-700 font-medium">- Rp {formatIDR(stats.unrecordedDebits)}</span>
                  </div>

                  <div className="border-t border-slate-300 pt-2 flex justify-between font-mono font-bold text-slate-900 bg-slate-50 -mx-3.5 -mb-3.5 p-3 rounded-b-lg">
                    <span>SALDO BUKU DISESUAIKAN:</span>
                    <span className="text-slate-900 text-sm">Rp {formatIDR(stats.adjustedGl)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reconciliation Balanced Audit Seal */}
            <div
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs ${
                stats.difference === 0
                  ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {stats.difference === 0 ? (
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                )}
                <div>
                  <div className="font-bold tracking-tight">
                    {stats.difference === 0
                      ? 'STATUS: TEREKONSILIASI PENUH & SEIMBANG (SELISIH = RP 0)'
                      : `STATUS: TERDAPAT TIMING DIFFERENCE SEBESAR RP ${formatIDR(stats.difference)}`}
                  </div>
                  <div className="text-[11px] opacity-80 mt-0.5">
                    {stats.difference === 0
                      ? 'Seluruh catatan perbankan dan buku besar telah diverifikasi silang tanpa varian sesuai PSAK 2.'
                      : 'Transaksi berjalan dalam proses kliring telah tercantum pada lampiran rincian audit.'}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="font-mono font-extrabold text-sm block">
                  Selisih: Rp {formatIDR(stats.difference)}
                </span>
                <span className="text-[10px] font-semibold opacity-75">
                  Tingkat Akurasi: {stats.difference === 0 ? '100% (Balanced)' : 'Dalam Proses'}
                </span>
              </div>
            </div>

            {/* Optional Audit Schedules (Lampiran Rincian Transaksi Belum Kliring) */}
            {includeReportSchedule && (
              <div className="space-y-4 pt-2 border-t border-slate-200 page-break-inside-avoid">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Lampiran: Jadwal Rincian Transaksi Belum Kliring (Audit Schedules)
                  </h3>
                  <span className="text-[10px] text-slate-500 italic">
                    Lampiran Dokumen Resmi BA-RECON
                  </span>
                </div>

                {/* 1. Deposits in Transit */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
                    <span>A. Setoran dalam Proses (Deposits in Transit) &bull; Jurnal Kas Masuk GL Belum Masuk Rekening Koran</span>
                    <span className="font-mono font-bold">Rp {formatIDR(stats.depositsInTransit)}</span>
                  </div>
                  {reportSchedules.depositsInTransit.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic px-2 py-1">
                      Tidak ada setoran dalam proses (Nihil / Seluruh setoran telah kliring di bank).
                    </div>
                  ) : (
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="text-slate-500 border-b text-[10px]">
                        <tr>
                          <th className="py-1 px-2">Tanggal</th>
                          <th className="py-1 px-2">No. Voucher</th>
                          <th className="py-1 px-2">Deskripsi / Rekanan</th>
                          <th className="py-1 px-2 text-right">Nominal (IDR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                        {reportSchedules.depositsInTransit.slice(0, 5).map((j) => (
                          <tr key={j.id}>
                            <td className="py-1 px-2">{j.transaction_date}</td>
                            <td className="py-1 px-2 font-bold">{j.voucher_code}</td>
                            <td className="py-1 px-2 font-sans truncate max-w-xs">{j.description}</td>
                            <td className="py-1 px-2 text-right font-bold text-emerald-700">Rp {formatIDR(j.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* 2. Outstanding Disbursements */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
                    <span>B. Cek Beredar / Pengeluaran Belum Kliring (Outstanding Checks) &bull; Pengeluaran Kas GL Belum Cair di Bank</span>
                    <span className="font-mono font-bold">Rp {formatIDR(stats.outstandingDisbursements)}</span>
                  </div>
                  {reportSchedules.outstandingDisbursements.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic px-2 py-1">
                      Tidak ada cek beredar (Nihil / Seluruh cek/pengeluaran telah dicairkan).
                    </div>
                  ) : (
                    <table className="w-full text-left text-[11px] border-collapse">
                      <thead className="text-slate-500 border-b text-[10px]">
                        <tr>
                          <th className="py-1 px-2">Tanggal</th>
                          <th className="py-1 px-2">No. Voucher</th>
                          <th className="py-1 px-2">Deskripsi / Penerima Cek</th>
                          <th className="py-1 px-2 text-right">Nominal (IDR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                        {reportSchedules.outstandingDisbursements.slice(0, 5).map((j) => (
                          <tr key={j.id}>
                            <td className="py-1 px-2">{j.transaction_date}</td>
                            <td className="py-1 px-2 font-bold">{j.voucher_code}</td>
                            <td className="py-1 px-2 font-sans truncate max-w-xs">{j.description}</td>
                            <td className="py-1 px-2 text-right font-bold text-rose-700">Rp {formatIDR(j.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Official 3-Signatory Block & Corporate Seal */}
            <div className="pt-6 border-t border-slate-200 page-break-inside-avoid">
              <div className="text-right text-[11px] text-slate-500 mb-6 font-mono">
                Jakarta, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>

              <div className="grid grid-cols-3 gap-6 text-center text-xs">
                {/* Signatory 1 */}
                <div className="flex flex-col justify-between h-36">
                  <p className="text-slate-500 font-medium">Dibuat Oleh,</p>
                  <div>
                    <p className="font-bold text-slate-900 border-t border-slate-400 pt-1">
                      Rina Suryani, S.Ak.
                    </p>
                    <p className="text-slate-500 text-[10px]">Staf Rekonsiliasi Kas &amp; Bank</p>
                    <p className="text-slate-400 text-[9px] font-mono">NIK: EMP-2022-048</p>
                  </div>
                </div>

                {/* Signatory 2 */}
                <div className="flex flex-col justify-between h-36">
                  <p className="text-slate-500 font-medium">Diperiksa Oleh,</p>
                  <div>
                    <p className="font-bold text-slate-900 border-t border-slate-400 pt-1">
                      Budi Santoso, S.E., M.Ak.
                    </p>
                    <p className="text-slate-500 text-[10px]">Supervisor Akuntansi &amp; GL</p>
                    <p className="text-slate-400 text-[9px] font-mono">NIK: EMP-2018-015</p>
                  </div>
                </div>

                {/* Signatory 3 */}
                <div className="flex flex-col justify-between h-36">
                  <p className="text-slate-500 font-medium">Disetujui Oleh,</p>
                  <div>
                    <p className="font-bold text-slate-900 border-t border-slate-400 pt-1">
                      Drs. Hendra Gunawan, Ak., CA, CPA
                    </p>
                    <p className="text-slate-500 text-[10px]">Finance &amp; Accounting Director</p>
                    <p className="text-slate-400 text-[9px] font-mono">NIK: BOD-2015-003</p>
                  </div>
                </div>
              </div>

              {/* Corporate Seal Box */}
              <div className="mt-6 flex justify-center">
                <div className="border border-dashed border-slate-300 rounded-md px-6 py-2 text-center text-[10px] text-slate-400 uppercase tracking-widest font-mono">
                  [ CAP / STEMPEL RESMI PT NUSANTARA GLOBAL MANDIRI ]
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ingestion Session History */}
      {showHistoryModal && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowHistoryModal(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 flex justify-center items-center no-print"
        >
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Riwayat Batch Ingestion Rekening Koran</h3>
                  <p className="text-xs text-slate-500">Log sesi penarikan mutasi otomatis via n8n SNAP BI</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
              {syncHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs font-semibold text-slate-600">Belum ada riwayat batch</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Jalankan workflow di n8n untuk mencatat sesi ingestion pertama.</p>
                </div>
              ) : (
                syncHistory.map((item, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-slate-100 bg-slate-50/80 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-slate-800">{item.batchId}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          SUCCESS
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Channel: <strong className="text-slate-700">{item.channel}</strong> &bull; Waktu: <strong className="text-slate-700">{item.timestamp}</strong>
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900">{item.count} Mutasi</span>
                      <p className="text-[10px] text-emerald-600 font-medium">Tersimpan ke DB</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: 3-Way Auto-Match Algorithm Explainer */}
      {showAlgorithmModal && (
        <div
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowAlgorithmModal(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm overflow-y-auto p-4 sm:p-6 flex justify-center items-center no-print"
        >
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border border-slate-200 relative my-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 shrink-0">
                  <CheckCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Algoritma 3-Way Auto-Match
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                      Spesifikasi Logika
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    3 Kriteria utama pencocokan otomatis antara Rekening Koran, Buku Kas GL, dan Invoice ERP
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAlgorithmModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
                title="Tutup (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content: 3 Algorithm Points */}
            <div className="py-4 space-y-3.5">
              {/* Point 1 */}
              <div className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 transition">
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                    1
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Exact 1-to-1 Match (Nominal &amp; Arah Transaksi Cermin)
                      </h4>
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full font-mono">
                        Rule 100%
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Mencocokkan transaksi dengan nominal yang <strong>persis sama</strong> (toleransi selisih Rp 0) serta memvalidasi arah aliran kas sesuai kaidah akuntansi:
                    </p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                      <div className="bg-white p-2 rounded border border-slate-200 flex items-center justify-between">
                        <span className="text-emerald-700 font-semibold">+ Kredit Bank (CR)</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-blue-700 font-semibold">Debet Kas GL (DB)</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-slate-200 flex items-center justify-between">
                        <span className="text-rose-700 font-semibold">- Debet Bank (DB)</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-blue-700 font-semibold">Kredit Kas GL (CR)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Point 2 */}
              <div className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 transition">
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                    2
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Date Tolerance Window &amp; Pola Referensi Invoice
                      </h4>
                      <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-mono">
                        Max H+3 Hari
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Memperhitungkan jeda waktu kliring perbankan (*timing difference*) serta mengekstrak nomor referensi transaksi:
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-600 list-disc list-inside">
                      <li><strong>Toleransi Tanggal:</strong> Rentang maksimal 3 hari kerja antara tanggal voucher internal dan tanggal efektif kliring di mutasi bank.</li>
                      <li><strong>Regex Pattern Match:</strong> Mengenali nomor invoice (<code className="text-slate-800 bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">INV-2026-xxx</code>) atau voucher (<code className="text-slate-800 bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">BKK/BKM-xxx</code>) pada catatan deskripsi bank.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Point 3 */}
              <div className="p-3.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:bg-slate-50 transition">
                <div className="flex items-start gap-3">
                  <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                    3
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                        Auto-Adjustment Rules (Biaya Bank &amp; Bunga Rekening)
                      </h4>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-mono">
                        Auto-Posting
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Mendeteksi transaksi rutin bank yang belum sempat diinput oleh staf akuntansi saat mutasi ditarik:
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-600 list-disc list-inside">
                      <li><strong>Biaya Administrasi:</strong> Keyword <code className="text-slate-800 bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">BIAYA ADM / PAJAK</code> otomatis di-generate ke akun beban <code className="text-slate-800 bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">610-100</code>.</li>
                      <li><strong>Jasa Giro:</strong> Keyword <code className="text-slate-800 bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">BUNGA / JASA GIRO</code> otomatis di-generate ke akun pendapatan <code className="text-slate-800 bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">710-100</code>.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Notice: Disabled for manual review */}
            <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Mode Review Manual Aktif:</span> Eksekusi otomatis langsung di-nonaktifkan sementara agar user dapat meninjau setiap transaksi secara selektif sebelum data dipadankan permanen ke database Supabase.
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAlgorithmModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
              >
                Tutup
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAlgorithmModal(false);
                    handleAutoMatch();
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Jalankan Auto-Match Sekarang</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Realtime Floating In-App Toast Notification */}
      {incomingToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm sm:max-w-md w-full bg-white border border-slate-200/90 rounded-2xl shadow-2xl p-4 transition-all duration-300 animate-in slide-in-from-bottom-5 no-print">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                  incomingToast.mutation_type === 'CR'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                <Bell className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900">
                    Mutasi Masuk! (SNAP BI Realtime)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {incomingToast.timestamp}
                  </span>
                </div>
                <div
                  className={`text-lg font-extrabold font-mono tracking-tight ${
                    incomingToast.mutation_type === 'CR' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {incomingToast.mutation_type === 'CR' ? '+ ' : '- '}
                  Rp {formatIDR(incomingToast.amount)}
                </div>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {incomingToast.description}
                </p>
                <div className="text-[10px] font-mono text-slate-400">
                  Ref: {incomingToast.bank_reference_no}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIncomingToast(null)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              title="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500 font-medium">
              Data otomatis tercatat di tabel mutasi
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setIncomingToast(null);
                  setShowAlgorithmModal(true);
                }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1 shadow-2xs cursor-pointer"
              >
                <CheckCheck className="w-3 h-3 text-emerald-400" />
                <span>Auto-Match</span>
              </button>
              <button
                onClick={() => setIncomingToast(null)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
