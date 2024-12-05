import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog } from "frog";
import { devtools } from "frog/dev";
import { neynar, type NeynarVariables } from "frog/middlewares";
import fetch from "node-fetch";
import dotenv from "dotenv";
import crypto from "crypto";

// بارگذاری متغیرهای محیطی از فایل .env
dotenv.config();

const AIRSTACK_API_KEY = process.env.AIRSTACK_API_KEY;
if (!AIRSTACK_API_KEY) {
  console.error("AIRSTACK_API_KEY is not defined in the environment variables");
  throw new Error("AIRSTACK_API_KEY is missing");
}

// تعریف برنامه Frog
export const app = new Frog({
  title: "Frog Frame",
  imageAspectRatio: "1:1",
  unstable_metaTags: [
    { property: "og:title", content: "Frog Frame" },
    { property: "og:type", content: "website" },
    { property: "og:image", content: "https://i.imgur.com/XznXt9o.png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "1200" },
    { property: "og:description", content: "An interactive frame for Frog." },
  ],
  imageOptions: {
    fonts: [
      {
        name: "Lilita One",
        weight: 400,
        source: "google",
      },
    ],
  },
  hub: {
    apiUrl: "https://hubs.airstack.xyz",
    fetchOptions: {
      headers: {
        "x-airstack-hubs": AIRSTACK_API_KEY,
      },
    },
  },
});

// ذخیره موقت برای شناسه‌ها و پارامترها
const paramStore = new Map<string, URLSearchParams>();

// تابع تولید هش یکتا برای پارامترها
function generateHash(params: URLSearchParams): string {
  return crypto.createHash("sha256").update(params.toString()).digest("hex").slice(0, 8);
}

interface PointsAPIResponse {
  fid: string;
  wallet_address: string;
  points: string;
  display_name: string;
  avatar_url: string;
  fname: string;
}

// تعریف getPointsByWallet
const getPointsByWallet = async (wallet: string): Promise<string | null> => {
  const apiUrl = `https://api.degen.tips/airdrop2/current/points?wallet=${wallet}`;
  try {
    const response = await fetch(apiUrl);
    const data = (await response.json()) as PointsAPIResponse[];
    if (Array.isArray(data) && data.length > 0) {
      return data[0].points;
    } else {
      return null;
    }
  } catch (error) {
    console.error(
      `Error fetching points for wallet ${wallet}:`,
      (error as Error).message
    );
    return null;
  }
};

// تعریف getTodayAllowance
const getTodayAllowance = async (
  fid: string
): Promise<{
  tipAllowance: string;
  remainingTipAllowance: string;
  tipped: string;
}> => {
  const apiUrl = `https://api.degen.tips/airdrop2/allowances?fid=${fid}`;
  const todayDate = new Date().toISOString().split("T")[0];
  let tipAllowance = "0";
  let remainingTipAllowance = "0";
  let tipped = "0";

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    if (Array.isArray(data)) {
      const todayAllowance = data.find((item: { snapshot_day?: string }) =>
        item.snapshot_day?.startsWith(todayDate)
      );
      if (todayAllowance) {
        tipAllowance = todayAllowance.tip_allowance || "0";
        remainingTipAllowance = todayAllowance.remaining_tip_allowance || "0";
        const totalTipped =
          Number(tipAllowance) - Number(remainingTipAllowance);
        tipped = totalTipped > 0 ? totalTipped.toString() : "0";
      }
    }
  } catch (error) {
    console.error("Error fetching today's allowances:", error);
  }

  return { tipAllowance, remainingTipAllowance, tipped };
};

// Endpoint برای ایجاد لینک کوتاه
app.post("/shorten", async (c) => {
  const query = c.req.query();

  if (!query) {
    return c.json({ error: "Missing query parameters" }, 400);
  }

  const urlParams = new URLSearchParams(Object.entries(query));
  const id = generateHash(urlParams);
  paramStore.set(id, urlParams);

  return c.json({ id, shortUrl: `https://degen-state.onrender.com/${id}` });
});

// Endpoint برای بازیابی لینک از روی ID و نمایش متا تگ
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const params = paramStore.get(id);

  if (!params) {
    return c.html("<h1>Invalid ID</h1>", 404);
  }

  const redirectUrl = `https://degen-state.onrender.com/?${params.toString()}`;
  const ogTitle = "Check Your Degen State";
  const ogDescription = "Interactive Frog Frame for your Degen State.";
  const ogImage = "https://i.imgur.com/XznXt9o.png";

  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta property="og:title" content="${ogTitle}" />
      <meta property="og:description" content="${ogDescription}" />
      <meta property="og:image" content="${ogImage}" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="1200" />
      <meta property="og:type" content="website" />
      <meta http-equiv="refresh" content="0;url=${redirectUrl}" />
      <title>Redirecting...</title>
    </head>
    <body>
      <p>Redirecting...</p>
    </body>
    </html>
  `);
});

// افزودن میان‌افزار neynar
app.use(
  neynar({
    apiKey: "057737BD-2028-4BC0-BE99-D1359BFD6BFF",
    features: ["interactor", "cast"],
  })
);

// ارائه فایل‌های استاتیک از پوشه public
app.use("/*", serveStatic({ root: "./public" }));

// تابع frame
app.frame("/", async (c) => {
  const query = c.req.query();

  let fid = query.fid || "";
  let username = query.username || "";
  let tipAllowance = query.tipAllowance || "";
  let remainingTipAllowance = query.remainingTipAllowance || "";
  let tipped = query.tipped || "";
  let displayPoints = query.points || "";
  let pfpUrl = query.pfpUrl || "";
  let imageWidth = "225";
  let imageHeight = "225";
  let imageTop = "3.85";
  let imageLeft = "25.8";

  if (query["embeds[]"]) {
    try {
      const decodedUrl = decodeURIComponent(query["embeds[]"]);
      const embedUrl = new URL(decodedUrl);
      const paramsFromEmbeds = Object.fromEntries(embedUrl.searchParams.entries());

      fid = paramsFromEmbeds.fid || fid;
      username = paramsFromEmbeds.username || username;
      tipAllowance = paramsFromEmbeds.tipAllowance || tipAllowance;
      remainingTipAllowance = paramsFromEmbeds.remainingTipAllowance || remainingTipAllowance;
      tipped = paramsFromEmbeds.tipped || tipped;
      displayPoints = paramsFromEmbeds.points || displayPoints;
      pfpUrl = paramsFromEmbeds.pfpUrl || pfpUrl;
      imageWidth = paramsFromEmbeds.imageWidth || imageWidth;
      imageHeight = paramsFromEmbeds.imageHeight || imageHeight;
      imageTop = paramsFromEmbeds.imageTop || imageTop;
      imageLeft = paramsFromEmbeds.imageLeft || imageLeft;
    } catch (error) {
      console.error("Error decoding embeds[]:", error);
    }
  }

  const { buttonValue } = c;
  const isMyState = buttonValue === "my_state";

  if (isMyState) {
    const userData = c.var as NeynarVariables;
    const {
      username: interactorUsername,
      fid: interactorFid,
      custodyAddress,
      verifiedAddresses,
      pfpUrl: interactorPfpUrl,
    } = userData.interactor || {};

    fid = interactorFid?.toString() || fid;
    pfpUrl = interactorPfpUrl || pfpUrl;

    const wallets: string[] = [];
    if (verifiedAddresses?.ethAddresses) wallets.push(...verifiedAddresses.ethAddresses);
    if (custodyAddress) wallets.push(custodyAddress);

    if (wallets.length > 0) {
      for (const wallet of wallets) {
        const points = await getPointsByWallet(wallet);
        if (points) {
          displayPoints = points;
          break;
        }
      }
    }

    const allowanceData = await getTodayAllowance(fid);
    tipAllowance = allowanceData.tipAllowance || tipAllowance;
    remainingTipAllowance = allowanceData.remainingTipAllowance || remainingTipAllowance;
    tipped = allowanceData.tipped || tipped;

    username = interactorUsername || username;
  }

  const urlParams = new URLSearchParams({
    fid,
    username,
    tipAllowance,
    remainingTipAllowance,
    tipped,
    points: displayPoints,
    pfpUrl,
    imageWidth,
    imageHeight,
    imageTop,
    imageLeft,
  });

  const id = generateHash(urlParams);
  paramStore.set(id, urlParams);

  const shortUrl = `https://degen-state.onrender.com/${id}`;
  const composeCastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
    "Check Your Degen State\nFrame By @jeyloo\n"
  )}&embeds[]=${encodeURIComponent(shortUrl)}`;
  console.log("Generated Share URL:", composeCastUrl);

  return c.res({
    image: (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "black",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontFamily: "'Lilita One', sans-serif",
        }}
      >
        <img
          src="https://i.imgur.com/XznXt9o.png"
          alt="Interactive Frog Frame"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 0,
          }}
        />
        {username && (
          <div
            style={{
              color: "lime",
              fontSize: "50px",
              fontWeight: "700",
              position: "absolute",
              top: "8.5%",
              left: "57%",
              transform: "translateX(-50%)",
              zIndex: 1,
            }}
          >
            {username}
          </div>
        )}
       {pfpUrl && (
          <img
            src={pfpUrl}
            alt="Profile Picture"
            style={{
              width: `${imageWidth}px`,
              height: `${imageHeight}px`,
              borderRadius: "50%",
              position: "absolute",
              top: `${imageTop}%`,
              left: `${imageLeft}%`,
              zIndex: 1,
              objectFit: "cover",
            }}
  />
)}


        {remainingTipAllowance && (
          <div
            style={{
              color: "#2E073F",
              fontSize: "50px",
              fontWeight: "100",
              position: "absolute",
              top: "71.5%",
              left: "52%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          >
            {remainingTipAllowance}
          </div>
        )}
        {tipAllowance && (
          <div
            style={{
              color: "#2E073F",
              fontSize: "45px",
              fontWeight: "50",
              position: "absolute",
              top: "52%",
              left: "52%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          >
            {tipAllowance}
          </div>
        )}
        {tipped && (
          <div
            style={{
              color: "#2E073F",
              fontSize: "45px",
              fontWeight: "50",
              position: "absolute",
              top: "89%",
              left: "52%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          >
            {`${tipped}`}
          </div>
        )}
        <div
          style={{
            color: "#674188",
            fontSize: "45px",
            fontWeight: "100",
            position: "absolute",
            top: "40%",
            left: "67%",
            transform: "translate(-50%, -50%) rotate(14deg)",
            zIndex: 2,
          }}
        >
          {`${displayPoints}`}
        </div>
        {fid && (
          <div
            style={{
              color: "yellow",
              fontSize: "21px",
              fontWeight: "50",
              position: "absolute",
              top: "23%",
              left: "55.5%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          >
            {fid}
          </div>
        )}
      </div>
    ),
    intents: [
      <Button value="my_state">My State</Button>,
      <Button.Link href={composeCastUrl}>Share</Button.Link>,
    ],
  });
});

// راه‌اندازی سرور
const port = 5173;
console.log(`Server is running on port ${port}`);

devtools(app, { serveStatic });
serve({
  fetch: app.fetch,
  port,
});
