import { Product, Order } from '../types';

export function getProductDiscount(product: Product, categoryDiscounts: Record<string, number>): number {
  const itemDis = product.discountPercentage || 0;
  const catDis = categoryDiscounts ? (categoryDiscounts[product.category] || 0) : 0;
  return Math.max(itemDis, catDis);
}

export function getProductEffectivePrice(product: Product, categoryDiscounts: Record<string, number>): number {
  const discount = getProductDiscount(product, categoryDiscounts);
  if (discount <= 0) return product.price;
  return Math.round(product.price * (1 - discount / 100));
}

/**
 * Compresses a base64 image string to a given quality level and max width/height using HTML5 Canvas.
 * Keeps local quota extremely lightweight.
 */
export function compressImageBase64(
  base64Str: string,
  maxWidth: number = 800,
  maxHeight: number = 800,
  quality: number = 0.5
): Promise<string> {
  return new Promise((resolve) => {
    // If it's not a valid web image base64, skip compression
    if (!base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Handle scaling down
      if (width > maxWidth || height > maxHeight) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // Export as jpeg format with lower quality
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedDataUrl);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

/**
 * Safely saves the orders list to localStorage by iteratively pruning
 * heavy base64 strings from historical orders if a QuotaExceededError is encountered.
 */
export function safeSaveOrders(orders: Order[]): void {
  const key = 'dulce_amanecer_orders';
  try {
    localStorage.setItem(key, JSON.stringify(orders));
  } catch (error) {
    if (error instanceof Error && (error.name === 'QuotaExceededError' || error.message.includes('quota'))) {
      console.warn("Storage quota exceeded. Initiating safety compression of historic orders...");
      
      // Attempt 1: Remove heavy images from orders older than index 3 (only keep images for the 3 most recent)
      const prunedOrders = orders.map((order, idx) => {
        if (idx > 2) {
          return {
            ...order,
            paymentReceiptUrl: order.paymentReceiptUrl ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="10" y="50">Liberado</text></svg>' : '',
            deliveryPhotoUrl: order.deliveryPhotoUrl ? 'pruned' : undefined,
            shipping: {
              ...order.shipping,
              cardPhotoUrl: undefined,
              cardPhotos: undefined
            }
          };
        }
        return order;
      });

      try {
        localStorage.setItem(key, JSON.stringify(prunedOrders));
        console.log("Successfully saved orders in compressed historical format.");
        return;
      } catch (e2) {
        // Attempt 2: Strip ALL images from all orders except the very latest (index 0)
        console.warn("Pruning further... Only keeping receipt for newest order.");
        const doublePruned = prunedOrders.map((order, idx) => {
          if (idx > 0) {
            return {
              ...order,
              paymentReceiptUrl: '',
              deliveryPhotoUrl: undefined,
              shipping: {
                ...order.shipping,
                cardPhotoUrl: undefined,
                cardPhotos: undefined
              }
            };
          }
          return order;
        });

        try {
          localStorage.setItem(key, JSON.stringify(doublePruned));
          console.log("Successfully saved orders in bare historical format.");
          return;
        } catch (e3) {
          // Attempt 3: Truncate list strictly to the 10 most recent orders and completely strip images from non-new ones
          console.error("Critical storage limit! Truncating to 10 most recent orders.");
          const ultraPruned = doublePruned.slice(0, 10);
          try {
            localStorage.setItem(key, JSON.stringify(ultraPruned));
            console.log("Successfully saved truncated list of 10 orders.");
          } catch (e4) {
            // Ultimate fallback: save without any images at all
            const textOnlyOrders = orders.slice(0, 15).map(o => ({
              ...o,
              paymentReceiptUrl: '',
              deliveryPhotoUrl: undefined,
              shipping: {
                ...o.shipping,
                cardPhotoUrl: undefined,
                cardPhotos: undefined
              }
            }));
            localStorage.setItem(key, JSON.stringify(textOnlyOrders));
            console.log("Saves successful via ultimate base-text strategy.");
          }
        }
      }
    } else {
      throw error;
    }
  }
}
