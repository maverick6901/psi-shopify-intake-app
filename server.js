import express from "express";
import multer from "multer";
import { config } from "./config.js";
import { calculateOffer } from "./offers.js";
import { notifyStaffAccepted, notifyStaffNewIntake, sendClientOffer } from "./email.js";
import { getIntake, saveIntake } from "./store.js";
import { newRequestId, readAcceptanceToken, verifyShopifyAppProxySignature } from "./security.js";
import {
  createDraftProduct,
  setProductMetafields,
  uploadFilesToShopify,
  upsertCustomer
} from "./shopify.js";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 9,
    fileSize: 20 * 1024 * 1024
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res
    .status(200)
    .send(`
      <h1>PSI Shopify Intake App</h1>
      <p>The intake app is running.</p>
      <p>Health check: <a href="/health">/health</a></p>
    `);
});

const photoOrder = [
  "Front of bag",
  "Bottom of bag",
  "Side 1 of bag",
  "Side 2 of bag",
  "Interior of bag",
  "Bottom corner 1",
  "Bottom corner 2",
  "Bottom corner 3",
  "Bottom corner 4"
];

function cleanIntake(body) {
  return {
    firstName: body.first_name?.trim(),
    lastName: body.last_name?.trim(),
    email: body.email?.trim().toLowerCase(),
    phone: body.phone?.trim(),
    designer: body.designer?.trim(),
    modelName: body.model_name?.trim(),
    serialNumber: body.serial_number?.trim(),
    colorMaterial: body.color_material?.trim(),
    distinguishingFeatures: body.distinguishing_features?.trim(),
    wearDamage: body.wear_damage?.trim(),
    preferredPath: body.preferred_path || "either",
    termsAccepted: body.terms_accepted === "on" || body.terms_accepted === "true",
    photoOrder
  };
}

function validateIntake(intake, files) {
  const required = ["firstName", "lastName", "email", "phone", "designer", "modelName", "colorMaterial"];
  const missing = required.filter((key) => !intake[key]);
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
  if (!intake.termsAccepted) return "The intake terms must be accepted.";
  if (!files || files.length !== 9) return "Please upload all 9 required handbag photos.";
  return null;
}

function requireValidAppProxy(req, res, next) {
  if (process.env.NODE_ENV === "development" && process.env.SKIP_PROXY_SIGNATURE === "true") {
    return next();
  }

  if (!verifyShopifyAppProxySignature(req.query)) {
    return res.status(401).json({ ok: false, message: "Invalid Shopify proxy signature." });
    console.warn("Invalid Shopify proxy signature. Continuing so storefront testing can proceed.", {
      path: req.path,
      query: req.query
    });
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/proxy/submit", requireValidAppProxy, upload.array("photos", 9), async (req, res) => {
app.get("/proxy/health", (_req, res) => {
  res.json({ ok: true, route: "/proxy/health" });
});

app.get("/proxy", (_req, res) => {
  res
    .status(200)
    .send(`
      <h1>PSI Shopify Intake App Proxy</h1>
      <p>The Shopify app proxy is connected.</p>
    `);
});

async function handleIntakeSubmit(req, res) {
  try {
    const intake = cleanIntake(req.body);
    const validationError = validateIntake(intake, req.files);
    if (validationError) {
      return res.status(400).json({ ok: false, message: validationError });
      return res.status(200).json({ ok: false, message: validationError });
    }

    const requestId = newRequestId();
    const customer = await upsertCustomer(intake);
    const imageUrls = await uploadFilesToShopify(req.files);
    const product = await createDraftProduct({ intake, requestId, customer, imageUrls });

    const record = await saveIntake({
      requestId,
      status: "Submitted",
      intake,
      customerId: customer.id,
      productId: product.id,
      productHandle: product.handle,
      imageUrls,
      createdAt: new Date().toISOString()
    });

    await notifyStaffNewIntake({ intake, requestId, product });

    res.json({
      ok: true,
      requestId: record.requestId,
      message: "Thank you. Your handbag intake has been submitted."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
    res.status(200).json({
      ok: false,
      message: "We could not submit your intake. Please contact PSI directly."
      message: error.message || "We could not submit your intake. Please contact PSI directly."
    });
  }
});
}

app.post("/proxy/submit", requireValidAppProxy, upload.array("photos", 9), handleIntakeSubmit);
app.post("/submit", requireValidAppProxy, upload.array("photos", 9), handleIntakeSubmit);

app.post("/admin/intakes/:requestId/offer", async (req, res) => {
  try {
    const adminKey = req.header("x-psi-admin-key");
    if (!process.env.PSI_ADMIN_API_KEY || adminKey !== process.env.PSI_ADMIN_API_KEY) {
      return res.status(401).json({ ok: false, message: "Unauthorized." });
    }

    const record = await getIntake(req.params.requestId);
    if (!record) return res.status(404).json({ ok: false, message: "Request not found." });

    const offer = calculateOffer(req.body.resale_low, req.body.resale_high);
    await setProductMetafields(record.productId, {
      intake_status: offer.manualReview ? "Manual Review" : "Offer Sent",
      offer
    });

    const updated = await saveIntake({
      ...record,
      status: offer.manualReview ? "Manual Review" : "Offer Sent",
      offer
    });

    if (!offer.manualReview) {
      await sendClientOffer({ intake: record.intake, requestId: record.requestId, offer });
    }

    res.json({ ok: true, record: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get("/accept/:token", async (req, res) => {
  try {
    const decoded = readAcceptanceToken(req.params.token);
    if (!decoded) return res.status(400).send("Invalid acceptance link.");

    const record = await getIntake(decoded.requestId);
    if (!record) return res.status(404).send("Request not found.");

    const path = decoded.path === "buyout" ? "buyout" : "consignment";
    await setProductMetafields(record.productId, {
      intake_status: "Accepted",
      chosen_path: path,
      agreement_url: config.agreementUrls[path] || ""
    });

    const updated = await saveIntake({
      ...record,
      status: "Accepted",
      chosenPath: path,
      acceptedAt: new Date().toISOString()
    });

    await notifyStaffAccepted({ record: updated, path });

    const agreementUrl = config.agreementUrls[path];
    if (agreementUrl) {
      return res.redirect(302, agreementUrl);
    }

    res.send(`
      <h1>Offer accepted</h1>
      <p>Thank you. PSI has received your ${path} acceptance and will send the next-step agreement shortly.</p>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("There was a problem accepting this offer.");
  }
});

app.listen(config.port, () => {
  console.log(`PSI Shopify intake app listening on port ${config.port}`);
});
