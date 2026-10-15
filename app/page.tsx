import { Dashboard } from "@/components/Dashboard";
import { getGeminiApiKey } from "@/lib/gemini";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard aiConfigured={Boolean(getGeminiApiKey())} />;
}
