import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "../../../lib/auth";
import AdminClient from "./admin-client";
import styles from "./admin.module.css";

export const metadata = {
  title: "Admin - Chakshu Jain",
  description: "Private admin tools for hikes and media ingest.",
};

export default async function AdminPage() {
  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });
  const email = session?.user?.email ?? null;
  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!session?.user) redirect("/admin/login");
  if (allowlist.length && (!email || !allowlist.includes(email.toLowerCase()))) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Admin Access Restricted</h1>
          <p className={styles.subtitle}>
            This account is signed in, but not in the admin allowlist.
          </p>
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
