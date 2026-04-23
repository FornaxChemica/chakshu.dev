import styles from "../admin.module.css";
import LoginClient from "./login-client";

export const metadata = {
  title: "Admin Login - Chakshu Jain",
  description: "Sign in to access admin tools.",
};

export default function AdminLoginPage() {
  return (
    <main className={styles.page}>
      <LoginClient />
    </main>
  );
}
