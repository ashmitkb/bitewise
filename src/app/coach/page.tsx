import type { Metadata } from "next";
import { CoachView } from "@/components/coach/CoachView";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return <CoachView />;
}
