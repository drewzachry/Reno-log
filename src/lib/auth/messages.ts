/** Plain-English reasons a sign-in email wasn't sent. */
export function sendErrorMessage(error: {
  status?: number;
  code?: string;
  message: string;
}): string {
  // Per-address cooldown: "For security purposes, you can only request this after 42 seconds."
  const wait = error.message.match(/after (\d+) seconds?/i);
  if (wait) return `Please wait ${wait[1]} seconds before asking for another email.`;
  // Project-wide cap: Supabase's built-in email sends only a few per hour.
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "The app has sent as many sign-in emails as it’s allowed for now. Try again in an hour.";
  }
  return "We couldn’t send the email. Check the address and try again.";
}
