import { getPrice } from "./getPrice";

export const checkTPSL = (
  curveAddress: string,
  buyPrice: number
): Promise<boolean> => {
  return new Promise((resolve) => {
    const priceTracker = setInterval(() => {
      getPrice(curveAddress).then((price) => {
        console.log(
          `Curve address: ${curveAddress} : ${buyPrice} => ${price} <==> ${
            (price / buyPrice) * 100
          }%`
        );
        if (price > buyPrice * 1.15) {
          console.log("Take Profit");
          clearInterval(priceTracker);
          resolve(true);
        } else if (price < buyPrice * 0.95) {
          console.log("Stop Loss");
          clearInterval(priceTracker);
          resolve(true);
        }
      });
    }, 400);
  });
};
