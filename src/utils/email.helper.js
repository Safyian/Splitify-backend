export const sendVerificationEmail = async ({ to, name, verificationUrl }) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Splitify <onboarding@resend.dev>',
      to,
      subject: 'Verify your Splitify account',
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 22px; font-weight: 700; color: #1C1C1E; margin-bottom: 8px;">
            Welcome to Splitify, ${name}! 👋
          </h2>
          <p style="font-size: 15px; color: #6B6B6B; line-height: 1.6; margin-bottom: 28px;">
            Thanks for signing up. Please verify your email address to activate your account.
          </p>
          <a href="${verificationUrl}"
             style="display: inline-block; background: #0DAD85; color: white;
                    font-size: 15px; font-weight: 600; padding: 14px 28px;
                    border-radius: 12px; text-decoration: none;">
            Verify Email Address
          </a>
          <p style="font-size: 13px; color: #9B9B9B; margin-top: 28px; line-height: 1.5;">
            This link expires in 24 hours. If you did not create a Splitify account,
            you can safely ignore this email.
          </p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error('Failed to send verification email: ' + error.message);
  }
};
