export type CheckoutIntent = {
  paymentId: string;
  gateway: string;
  id: string;
  amount: number;
  keyId?: string;
  sessionId?: string;
  mode?: string;
  settled?: boolean;
};
const scripts = new Map<string, Promise<void>>();
async function sdk(src: string) {
  let promise = scripts.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => {
        scripts.delete(src);
        script.remove();
        reject(
          new Error(
            "Payment checkout could not be loaded. Your order remains available in history.",
          ),
        );
      };
      document.head.appendChild(script);
    });
    scripts.set(src, promise);
  }
  return promise;
}
export async function hostedCheckout(
  intent: CheckoutIntent,
  verify: (response: Record<string, unknown>) => Promise<unknown>,
  name: string,
) {
  if (intent.settled) return;
  if (intent.gateway === "Razorpay") {
    await sdk("https://checkout.razorpay.com/v1/checkout.js");
    const scope = window as unknown as {
      Razorpay: new (options: Record<string, unknown>) => { open: () => void };
    };
    await new Promise<void>((resolve, reject) => {
      const checkout = new scope.Razorpay({
        key: intent.keyId,
        order_id: intent.id,
        amount: intent.amount,
        currency: "INR",
        name,
        theme: { color: "#4863ee" },
        modal: {
          ondismiss: () =>
            reject(
              new Error(
                "Checkout closed. Check the existing order before another purchase.",
              ),
            ),
        },
        handler: async (response: Record<string, unknown>) => {
          try {
            await verify(response);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      });
      checkout.open();
    });
  } else {
    await sdk("https://sdk.cashfree.com/js/v3/cashfree.js");
    const scope = window as unknown as {
      Cashfree: (options: { mode: string }) => {
        checkout: (options: {
          paymentSessionId: string | undefined;
          redirectTarget: string;
        }) => Promise<unknown>;
      };
    };
    await scope
      .Cashfree({ mode: intent.mode || "sandbox" })
      .checkout({
        paymentSessionId: intent.sessionId,
        redirectTarget: "_modal",
      });
    await verify({});
  }
}
