"use client";

import { useState } from "react";

import { authClient } from "../../../../lib/auth-client";
import styles from "../admin.module.css";

export default function LoginClient() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/admin",
      });
      const payload = result as unknown as {
        data?: { url?: string | null };
        url?: string | null;
        error?: { message?: string };
      };

      if (payload?.data?.url) {
        window.location.href = payload.data.url;
        return;
      }
      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }
      if (payload?.error?.message) {
        setMessage(payload.error.message);
        return;
      }
      setMessage("Google sign-in did not start. Check OAuth secrets and try again.");
    } catch {
      setMessage("Could not start Google sign-in. Confirm GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={styles.loginGlowCyan} aria-hidden="true" />
      <div className={styles.loginGlowTeal} aria-hidden="true" />
      <div className={styles.loginCard}>
        <div className={styles.loginLogo}>CJ</div>
        <div className={styles.loginPill}>ADMIN ACCESS</div>
        <h1 className={styles.loginTitle}>chakshu.dev</h1>
        <p className={styles.loginSubtitle}>trail management console</p>
        <div className={styles.loginDivider} />
        <div className={styles.loginActions}>
          <button type="button" className={styles.googleBtn} onClick={signIn} disabled={loading}>
            <span className={styles.googleIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.6 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.8H12z"/>
                <path fill="#34A853" d="M2 12c0 1.6.4 3.2 1.3 4.5l3.2-2.5c-.4-.6-.6-1.3-.6-2s.2-1.4.6-2L3.3 7.5C2.4 8.8 2 10.4 2 12z"/>
                <path fill="#4A90E2" d="M12 22c2.7 0 5-0.9 6.6-2.5l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4l-3.2 2.5C4.8 19.8 8.1 22 12 22z"/>
                <path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2L3.2 7.5C2.4 8.8 2 10.4 2 12s.4 3.2 1.2 4.5L6.4 14z"/>
              </svg>
            </span>
            <span>{loading ? "Redirecting..." : "Continue with Google"}</span>
          </button>
          {message ? <p className={styles.status} data-status="error">{message}</p> : null}
        </div>
        <p className={styles.loginFootnote}>access restricted · chakshuvinayjain@gmail.com only</p>
      </div>
    </>
  );
}
