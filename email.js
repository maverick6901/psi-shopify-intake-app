import { config } from "./config.js";
import { moneyRange } from "./offers.js";
import { makeAcceptanceToken } from "./security.js";

export async function sendMail({ to, subject, html, text }) {
  if (config.emailDelivery !== "resend") {
    console.log("Email delivery is set to log:", { to, subject, text });
    return;
  }

  if (!config.resendApiKey) {
    throw new Error("RESEND_API_KEY is required when EMAIL_DELIVERY=resend.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.fromEmail,
      to: [to],
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    throw new Error(`Email provider error: ${await response.text()}`);
  }
}

export async function notifyStaffNewIntake({ intake, requestId, product }) {
  await sendMail({
    to: config.psiAdminEmail,
    subject: `New PSI intake: ${requestId}`,
    html: `
      <h2>New handbag intake submitted</h2>
      <p><strong>Request:</strong> ${requestId}</p>
      <p><strong>Client:</strong> ${intake.firstName} ${intake.lastName} (${intake.email})</p>
      <p><strong>Bag:</strong> ${intake.designer} ${intake.modelName}</p>
      <p><strong>Shopify draft product:</strong> ${product.id}</p>
      <p>Next step: review images, estimate resale range, then call the offer endpoint.</p>
    `,
    text: `New PSI intake ${requestId}: ${intake.firstName} ${intake.lastName}, ${intake.designer} ${intake.modelName}. Product: ${product.id}`
  });
}

export async function sendClientOffer({ intake, requestId, offer }) {
  const consignmentToken = makeAcceptanceToken(requestId, "consignment");
  const buyoutToken = makeAcceptanceToken(requestId, "buyout");
  const consignmentUrl = `${config.appBaseUrl}/accept/${consignmentToken}`;
  const buyoutUrl = `${config.appBaseUrl}/accept/${buyoutToken}`;

  await sendMail({
    to: intake.email,
    subject: `Your Purseonal Shopper offer for ${intake.designer} ${intake.modelName}`,
    html: `
      <p>Hi ${intake.firstName},</p>
      <p>Thank you for submitting your handbag to Purseonal Shopper Inc.</p>
      <p>Based on our preliminary review, the estimated resale range is <strong>${moneyRange(
        offer.resaleLow,
        offer.resaleHigh
      )}</strong>.</p>
      <p>Your consignment payout range is <strong>${moneyRange(offer.cproLow, offer.cproHigh)}</strong>.</p>
      <p>Your buyout price range is <strong>${moneyRange(offer.bpLow, offer.bpHigh)}</strong>.</p>
      <p>
        <a href="${consignmentUrl}">Accept Consignment Offer</a><br>
        <a href="${buyoutUrl}">Accept Buyout Offer</a>
      </p>
      <p>Final pricing remains subject to receipt, inspection, condition verification, and authentication.</p>
    `,
    text: `Estimated resale: ${moneyRange(offer.resaleLow, offer.resaleHigh)}
Consignment payout range: ${moneyRange(offer.cproLow, offer.cproHigh)}
Buyout price range: ${moneyRange(offer.bpLow, offer.bpHigh)}
Accept consignment: ${consignmentUrl}
Accept buyout: ${buyoutUrl}`
  });
}

export async function notifyStaffAccepted({ record, path }) {
  await sendMail({
    to: config.psiAdminEmail,
    subject: `PSI ${path} accepted: ${record.requestId}`,
    html: `
      <h2>Client accepted ${path}</h2>
      <p><strong>Request:</strong> ${record.requestId}</p>
      <p><strong>Client:</strong> ${record.intake.firstName} ${record.intake.lastName} (${record.intake.email})</p>
      <p><strong>Product:</strong> ${record.productId}</p>
    `,
    text: `Client accepted ${path} for ${record.requestId}. Product: ${record.productId}`
  });
}
