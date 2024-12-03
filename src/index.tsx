import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Button, Frog } from "frog";
import { devtools } from "frog/dev";
import { neynar, type NeynarVariables } from "frog/middlewares";
import fetch from "node-fetch";
import dotenv from "dotenv";

// بارگذاری متغیرهای محیطی از فایل .env
dotenv.config();

// بررسی کلید API
const AIRSTACK_API_KEY = process.env.AIRSTACK_API_KEY;
if (!AIRSTACK_API_KEY) {
  console.error("AIRSTACK_API_KEY is not defined in the environment variables");
  throw new Error("AIRSTACK_API_KEY is missing");
}

// تعریف اپلیکیشن Frog با پیکربندی اولیه
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
        "x-airstack-hubs": AIRSTACK_API_KEY, // استفاده از کلید API
      },
    },
  },
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

// مقدار پیش‌فرض fid
const defaultFid = "50000";

// تعریف نوع پاسخ جدید برای Points API
interface PointsAPIResponse {
  fid: string;
  wallet_address: string;
  points: string;
  display_name: string;
  avatar_url: string;
  fname: string;
}

// تابع برای دریافت Points بر اساس Wallet
const getPointsByWallet = async (wallet: string): Promise<string | null> => {
  const apiUrl = `https://api.degen.tips/airdrop2/current/points?wallet=${wallet}`;

  try {
    const response = await fetch(apiUrl);
    const data = (await response.json()) as PointsAPIResponse[];

    if (Array.isArray(data) && data.length > 0) {
      const points = data[0].points; // فرض می‌کنیم اولین آیتم آرایه مدنظر است
      return points;
    } else {
      return null; // No points found
    }
  } catch (error) {
    console.error(
      `Error fetching points for wallet ${wallet}:`,
      (error as Error).message
    );
    return null; // Error occurred
  }
};

// تابع برای دریافت Allowance روزانه
const getTodayAllowance = async (
  fid: string
): Promise<{
  tipAllowance: string;
  remainingTipAllowance: string;
  tipped: string;
}> => {
  const apiUrl = `https://api.degen.tips/airdrop2/allowances?fid=${fid}`;
  const todayDate = new Date().toISOString().split("T")[0]; // تاریخ امروز به فرمت YYYY-MM-DD
  let tipAllowance = "0";
  let remainingTipAllowance = "0";
  let tipped = "0";

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (Array.isArray(data)) {
      // فیلتر کردن داده‌های امروز
      const todayAllowance = data.find((item: { snapshot_day?: string }) =>
        item.snapshot_day?.startsWith(todayDate)
      );

      if (todayAllowance) {
        // مقدار تیپ‌هایی که امروز داده شده
        tipAllowance = todayAllowance.tip_allowance || "0";
        remainingTipAllowance = todayAllowance.remaining_tip_allowance || "0";

        // محاسبه تعداد تیپ‌هایی که امروز داده شده
        const totalTipped =
          Number(tipAllowance) - Number(remainingTipAllowance);

        tipped = totalTipped > 0 ? totalTipped.toString() : "0";
      } else {
        console.log("No allowances found for today.");
      }
    } else {
      console.warn("Data is not in the expected format:", data);
    }
  } catch (error) {
    console.error("Error fetching today's allowances:", error);
  }

  return { tipAllowance, remainingTipAllowance, tipped };
};

// تغییر در تابع frame برای پاکسازی افرادی که از کاربر فعلی فریم تیپ گرفته‌اند
app.frame("/", async (c) => {
  const { buttonValue } = c;
  const showFid = buttonValue === "my_state";

  console.log("Request is being validated by Airstack...");

  // دریافت متغیرهای interactor از Neynar
  const userData = c.var as NeynarVariables;
  const {
    username,
    pfpUrl,
    fid: interactorFid,
    custodyAddress,
    verifiedAddresses,
  } = userData.interactor || {};

  // مقدار fid پیش‌فرض
  let fid = defaultFid;
  if (interactorFid) {
    fid = interactorFid.toString();
  }

  // دریافت Allowance برای fid
  const { tipAllowance, remainingTipAllowance, tipped } =
    await getTodayAllowance(fid);

  // استخراج و بررسی تمام آدرس‌های کاربر
  const wallets: string[] = [];
  if (verifiedAddresses?.ethAddresses) {
    wallets.push(...verifiedAddresses.ethAddresses);
  }
  if (custodyAddress) {
    wallets.push(custodyAddress);
  }

  let displayPoints = "N/A"; // مقدار پیش‌فرض برای Points

  if (wallets.length > 0) {
    console.log("Checking points for all user wallets:");
    for (const wallet of wallets) {
      const points = await getPointsByWallet(wallet);
      if (points) {
        displayPoints = points; // اگر حداقل یک کیف پول points داشته باشد
        break; // بلافاصله از حلقه خارج می‌شویم
      }
    }
  } else {
    console.log("No wallets found for this user.");
  }

  // متن کست پیش‌فرض
  // تغییر در تابع frame برای ساخت لینک کست
const composeCastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
  "Check Your Degen State\nFrame By @Jeyloo\n"
)}&embeds[]=${encodeURIComponent(
  "https://f685-109-61-80-227.ngrok-free.app/page=stats" // لینک تصویر وضعیت کاربر که آمارها را شامل می‌شود
)}`;



  // بازگشت پاسخ با تصویر و کامپوننت‌های مورد نیاز
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
          fontFamily: "'Lilita One', sans-serif", // استفاده از فونت Lilita One
        }}
      >
        {/* تصویر اصلی فریم */}
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

        {/* تصویر پروفایل */}
        {pfpUrl && (
          <img
            src={pfpUrl}
            alt="Profile Picture"
            style={{
              width: "223px",
              height: "223px",
              borderRadius: "50%",
              position: "absolute",
              top: "3.8%",
              left: "25.85%",
              zIndex: 1,
            }}
          />
        )}

        {/* نام کاربری */}
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

        {/* Remaining Tip Allowance */}
        {remainingTipAllowance && (
          <div
            style={{
              color: "#2E073F",
              fontSize: "50px",
              fontWeight: "100",
              position: "absolute",
              top: "72%",
              left: "52%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
            }}
          >
            {remainingTipAllowance}
          </div>
        )}

        {/* Tip Allowance */}
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

        {/* Tipped */}
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


        {/* Points */}
        <div
          style={{
            color:"#674188",
            fontSize: "45px",
            fontWeight: "100",
            position: "absolute",
            top: "40%",
            left: "67%",
            transform: "translate(-50%, -50%) rotate(14deg)", // چرخاندن متن به زاویه 15 درجه
            zIndex: 2,
          }}
        >
          {`${displayPoints}`}
        </div>

        {/* FID در صورت کلیک روی My State */}
        {showFid && fid && (
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