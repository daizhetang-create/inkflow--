import { AttentionRoot } from "./AttentionRoot";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const viewer = user ? { displayName: user.displayName, email: user.email } : null;
  return <AttentionRoot viewer={viewer}/>;
}
