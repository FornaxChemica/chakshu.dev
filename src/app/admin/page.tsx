import { headers } from "next/headers";
import Link from "next/link";

import { getAccessAuthenticatedEmailFromHeaders, isAdminEmail } from "../../../lib/admin-auth";
import AdminClient from "./admin-client";
import styles from "./admin.module.css";

export const metadata = {
  title: "Admin - Chakshu Jain",
  description: "Private admin tools for hikes and media ingest.",
};

export default async function AdminPage() {
  const headerStore = await headers();
  const email = getAccessAuthenticatedEmailFromHeaders(headerStore);
  const authorized = isAdminEmail(email);

  if (!authorized) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Admin Access Required</h1>
          <p className={styles.subtitle}>
            Sign in through Cloudflare Access with your allowed Google account, then refresh this page.
          </p>
          <Link className={styles.backLink} href="/">
            ← Back to site
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <AdminClient adminEmail={email ?? "authorized-admin"} />
    </main>
  );
}
