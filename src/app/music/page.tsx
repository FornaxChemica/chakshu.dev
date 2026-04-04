import { redirect } from "next/navigation";

export const metadata = {
  title: "Chakshu Jain — Music",
  description: "Chakshu Jain music dashboard: now playing, recent tracks, top artists.",
};

export default function MusicPage() {
  redirect("/music/index.html");
}
