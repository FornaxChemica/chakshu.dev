import styles from "../admin.module.css";
import LoginClient from "./login-client";

export const metadata = {
  title: "Admin Login - Chakshu Jain",
  description: "Sign in to access admin tools.",
};

export default function AdminLoginPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Admin Login</h1>
        <p className={styles.subtitle}>Sign in with Google to access the upload dashboard.</p>
        <LoginClient />
      </div>
    </main>
  );
}

