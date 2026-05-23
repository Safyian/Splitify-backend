import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const sendOtp = async (phone, otp) => {
  await client.messages.create({
    body: `Your Splittify verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
};

export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
