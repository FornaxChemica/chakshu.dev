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
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/admin",
      });
    } catch {
      setMessage("Could not start Google sign-in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.actions}>
      <button type="button" className={styles.publishBtn} onClick={signIn} disabled={loading}>
        {loading ? "Redirecting..." : "Continue with Google"}
      </button>
      {message ? <p className={styles.status} data-status="error">{message}</p> : null}
    </div>
  );
}
