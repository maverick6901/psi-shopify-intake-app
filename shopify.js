import { config } from "./config.js";
import { getAccessToken } from "./shopify-auth.js";

const endpoint = `https://${config.shopDomain}/admin/api/${config.apiVersion}/graphql.json`;

export async function adminGraphql(query, variables = {}) {
  const accessToken = await getAccessToken();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const json = await response.json();
  if (!response.ok || json.errors) {
    throw new Error(JSON.stringify(json.errors || json, null, 2));
  }
  return json.data;
}

export async function findCustomerByEmail(email) {
  const data = await adminGraphql(
    `#graphql
    query FindCustomer($query: String!) {
      customers(first: 1, query: $query) {
        nodes { id email firstName lastName phone }
      }
    }`,
    { query: `email:${email}` }
  );
  return data.customers.nodes[0] || null;
}

export async function upsertCustomer(intake) {
  const existing = await findCustomerByEmail(intake.email);
  if (existing) return existing;

  const data = await adminGraphql(
    `#graphql
    mutation CustomerCreate($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id email firstName lastName phone }
        userErrors { field message }
      }
    }`,
    {
      input: {
        firstName: intake.firstName,
        lastName: intake.lastName,
        email: intake.email,
        phone: intake.phone || null,
        tags: ["PSI Prospect", "Consignment Buyout Intake"]
      }
    }
  );

  const errors = data.customerCreate.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return data.customerCreate.customer;
}

export async function createStagedTargets(files) {
  const data = await adminGraphql(
    `#graphql
    mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      input: files.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        httpMethod: "POST",
        resource: "PRODUCT_IMAGE"
      }))
    }
  );

  const errors = data.stagedUploadsCreate.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return data.stagedUploadsCreate.stagedTargets;
}

export async function uploadFilesToShopify(files) {
  const targets = await createStagedTargets(files);

  await Promise.all(
    targets.map(async (target, index) => {
      const form = new FormData();
      for (const parameter of target.parameters) {
        form.append(parameter.name, parameter.value);
      }
      form.append("file", new Blob([files[index].buffer], { type: files[index].mimetype }), files[index].originalname);

      const response = await fetch(target.url, { method: "POST", body: form });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Shopify staged upload failed: ${body}`);
      }
    })
  );

  return targets.map((target) => target.resourceUrl);
}

function metafield(key, value, type = "single_line_text_field") {
  return {
    namespace: "psi",
    key,
    type,
    value: value == null ? "" : String(value)
  };
}

export async function createDraftProduct({ intake, requestId, customer, imageUrls }) {
  const title = `${intake.designer} ${intake.modelName}`.trim() || `PSI Intake ${requestId}`;

  const data = await adminGraphql(
    `#graphql
    mutation ProductCreate($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product { id title handle status }
        userErrors { field message }
      }
    }`,
    {
      product: {
        title,
        vendor: intake.designer || "Purseonal Shopper Intake",
        productType: "Luxury Handbag",
        status: "DRAFT",
        tags: ["PSI Intake", "Status: Submitted", `Request: ${requestId}`],
        descriptionHtml: `
          <p><strong>Internal PSI intake request:</strong> ${requestId}</p>
          <p><strong>Client:</strong> ${intake.firstName} ${intake.lastName} (${intake.email})</p>
          <p><strong>Bag:</strong> ${intake.designer} ${intake.modelName}</p>
          <p><strong>Wear/Damage:</strong> ${intake.wearDamage || "Not provided"}</p>
        `,
        metafields: [
          metafield("request_id", requestId),
          metafield("intake_status", "Submitted"),
          metafield("customer_id", customer.id),
          metafield("client_name", `${intake.firstName} ${intake.lastName}`),
          metafield("client_email", intake.email),
          metafield("client_phone", intake.phone),
          metafield("designer", intake.designer),
          metafield("model_name", intake.modelName),
          metafield("serial_number", intake.serialNumber),
          metafield("color_material", intake.colorMaterial),
          metafield("distinguishing_features", intake.distinguishingFeatures, "multi_line_text_field"),
          metafield("wear_damage", intake.wearDamage, "multi_line_text_field"),
          metafield("preferred_path", intake.preferredPath),
          metafield("photo_order", JSON.stringify(intake.photoOrder), "json")
        ]
      },
      media: imageUrls.map((url, index) => ({
        mediaContentType: "IMAGE",
        originalSource: url,
        alt: `${title} - ${intake.photoOrder[index] || `Photo ${index + 1}`}`
      }))
    }
  );

  const errors = data.productCreate.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return data.productCreate.product;
}

export async function setProductMetafields(productId, fields) {
  const metafields = Object.entries(fields).map(([key, value]) => ({
    ownerId: productId,
    namespace: "psi",
    key,
    type: typeof value === "object" ? "json" : "single_line_text_field",
    value: typeof value === "object" ? JSON.stringify(value) : String(value ?? "")
  }));

  const data = await adminGraphql(
    `#graphql
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }`,
    { metafields }
  );

  const errors = data.metafieldsSet.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return data.metafieldsSet.metafields;
}
