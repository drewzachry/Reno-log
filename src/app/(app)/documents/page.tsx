import { Placeholder } from "@/components/Placeholder";

export const metadata = { title: "Documents" };

export default function Page() {
  return (
    <Placeholder
      title="Documents"
      body="Your plans, contract and specs, with the key points pulled out."
      empty="Coming soon: add your contract and plans here, and the chat will answer questions from them with the page number."
    />
  );
}
