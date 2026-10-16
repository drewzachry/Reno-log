import { NextResponse } from "next/server";
import { chatTurn, turnRequestSchema } from "@/lib/chat/turn";

// Reading a photo and answering can take a while.
export const maxDuration = 60;

export async function POST(request: Request) {
  const parsed = turnRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { ok: false, error: "That message didn't send. Please try again." },
      { status: 400 },
    );
  const result = await chatTurn(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
