import { ResumeRedirect } from "@/components/ResumeRedirect";

// Sends you back to the last chapter you were reading on this device.
// (Cross-device resume arrives with progress tracking in phase 4.)
export default function Home() {
  return <ResumeRedirect />;
}
