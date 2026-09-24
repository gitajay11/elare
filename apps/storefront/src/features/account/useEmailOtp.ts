import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@elare/utils';
import { api } from '@/lib/api';

/**
 * Every rule of the sign-up code lives on the server; this hook only drives
 * the screen. It sends { email } to request a code and { email, otp } to
 * check one, and turns the answers into one of these states:
 */
export type OtpStatus =
  | 'sending'        // first code on its way
  | 'idle'           // waiting for input
  | 'typing'         // some digits entered
  | 'complete'       // four digits, about to verify
  | 'verifying'      // server is checking
  | 'success'        // server confirmed
  | 'invalid'        // server said the code doesn't match
  | 'expired'        // code expired or locked after too many attempts
  | 'resending'      // new code requested
  | 'network-error'; // couldn't reach the server

export interface OtpMessage { tone: 'info' | 'error' | 'success'; text: string }

const LENGTH = 4;
const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const offline = (e: unknown) => !(e instanceof ApiError) || e.status === 0;
const minutes = (s: number) => Math.max(1, Math.ceil(s / 60));

export function useEmailOtp(email: string) {
  const [status, setStatus] = useState<OtpStatus>('sending');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<OtpMessage | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [errorKey, setErrorKey] = useState(0);
  const lastAction = useRef<'send' | 'verify'>('send');
  const busy = useRef(false);
  const started = useRef(false);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const send = useCallback(async (kind: 'initial' | 'resend') => {
    if (busy.current) return;
    busy.current = true;
    lastAction.current = 'send';
    setStatus(kind === 'initial' ? 'sending' : 'resending');
    if (kind === 'resend') setMessage(null);
    try {
      const r = await api.sendSignupOtp(email);
      setResendIn(r.resend_in);
      setCode('');
      setStatus('idle');
      setMessage(kind === 'resend' ? { tone: 'success', text: 'A new code is on its way — check your inbox.' } : null);
    } catch (e) {
      if (offline(e)) {
        setStatus('network-error');
        setMessage({ tone: 'error', text: 'We couldn’t reach Élaré. Check your connection and try again.' });
      } else if (e instanceof ApiError && e.code === 'cooldown') {
        setResendIn(Number(e.details.retry_after) || 30);
        setStatus('idle');
        setMessage(kind === 'initial'
          ? { tone: 'info', text: 'We’ve just sent you a code — check your inbox.' }
          : { tone: 'info', text: 'Please wait a moment before requesting another code.' });
      } else if (e instanceof ApiError && e.status === 429) {
        const wait = Number(e.details.retry_after) || 600;
        setResendIn(wait);
        setStatus('idle');
        setMessage({ tone: 'error', text: `Too many codes requested. Try again in ${minutes(wait)} min.` });
      } else {
        setStatus('network-error');
        setMessage({ tone: 'error', text: (e as Error).message || 'We couldn’t send your code. Please try again.' });
      }
    } finally {
      busy.current = false;
    }
  }, [email]);

  const verify = useCallback(async (value: string) => {
    if (busy.current || !/^\d{4}$/.test(value)) return;
    busy.current = true;
    lastAction.current = 'verify';
    setStatus('verifying');
    setMessage(null);
    // Let the tiles finish gathering before the result is shown — the server
    // decides the outcome; this only paces the reveal.
    const begin = Date.now();
    const settle = () => new Promise((r) => setTimeout(r, Math.max(0, (prefersReducedMotion() ? 350 : 1050) - (Date.now() - begin))));
    try {
      await api.verifySignupOtp(email, value);
      await settle();
      setStatus('success');
      setMessage(null);
    } catch (e) {
      await settle();
      if (offline(e)) {
        setStatus('network-error');
        setMessage({ tone: 'error', text: 'We couldn’t reach Élaré. Check your connection and try again.' });
      } else if (e instanceof ApiError && (e.code === 'expired_otp' || e.code === 'too_many_attempts')) {
        setCode('');
        setStatus('expired');
        setResendIn(0);
        setMessage({ tone: 'error', text: e.code === 'expired_otp' ? 'This code has expired. Request a new verification code.' : 'Too many incorrect attempts. Request a new verification code.' });
      } else if (e instanceof ApiError && e.code === 'invalid_otp') {
        const left = Number(e.details.attempts_left);
        setStatus('invalid');
        setErrorKey((k) => k + 1);
        setMessage({ tone: 'error', text: `That code doesn’t match. Please try again.${left > 0 && left <= 2 ? ` ${left} ${left === 1 ? 'attempt' : 'attempts'} left.` : ''}` });
        // After the shake, clear the boxes for a fresh try.
        setTimeout(() => { setCode(''); setStatus((s) => (s === 'invalid' ? 'idle' : s)); }, 700);
      } else {
        setStatus('invalid');
        setErrorKey((k) => k + 1);
        setMessage({ tone: 'error', text: (e as Error).message });
      }
    } finally {
      busy.current = false;
    }
  }, [email]);

  const onCodeChange = useCallback((v: string) => {
    setCode(v);
    const digits = v.replace(/\D/g, '').length;
    setStatus((s) => (['verifying', 'success', 'sending', 'resending'].includes(s) ? s : digits === LENGTH ? 'complete' : digits ? 'typing' : 'idle'));
    setMessage((m) => (m?.tone === 'error' ? null : m));
  }, []);

  const retry = useCallback(() => (lastAction.current === 'verify' && /^\d{4}$/.test(code) ? verify(code) : send('initial')), [code, send, verify]);

  // Send the first code as soon as the screen opens (once, even in StrictMode).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send('initial');
  }, [send]);

  return { status, code, message, resendIn, errorKey, length: LENGTH, onCodeChange, verify, resend: () => send('resend'), retry };
}

/** u***@gmail.com */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}
