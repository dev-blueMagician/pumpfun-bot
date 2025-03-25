import { getPrice } from "./getPrice";

export const checkTPSL = (
  curveAddress: string,
  buyPrice: number,
  startTime: number
): Promise<boolean> => {
  return new Promise((resolve) => {
    let minPrice = 100;
    let maxPrice = 0;
    const priceTracker = setInterval(() => {
      getPrice(curveAddress).then((price) => {
        // console.log(
        //   `Curve address: ${curveAddress} : ${buyPrice} => ${price} <==> ${
        //     (price / buyPrice) * 100
        //   }%`
        // );

        const holdTime = Date.now() - startTime;
         
        if (price < buyPrice * 0.94) {
          console.log(`🔴 Stop Loss ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
          clearInterval(priceTracker);
          resolve(true);
        }
        if (price > buyPrice * 3.5) {
          console.log(`🟢 Take Profit ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
          clearInterval(priceTracker);
          resolve(true);
        }

        if (holdTime > 2 * 1000 && price < maxPrice * 0.5 && price > buyPrice * 0.94) {
          console.log(`🟣 Take Profit ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
          clearInterval(priceTracker);
          resolve(true);
        }
        
        if (holdTime > 3.5 * 60 * 1000) {
          console.log(`🕒 ${price > buyPrice ? "🟢" : "🔴"} Time Out ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
          clearInterval(priceTracker);
          resolve(true);
        }

        if (price < minPrice) {
          minPrice = price;
        } else if (price > maxPrice) {
          maxPrice = price;
        }

        // if (holdTime < 0.2 * 60 * 1000 && price > buyPrice * 1.24) {
        //   console.log(`🔵 Take Profit ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // } else if (price < buyPrice * 0.48) {
        //   console.log(`🔴 Stop Loss ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // } else if (holdTime > 0.5 * 60 * 1000 && holdTime < 1.8 * 60 * 1000 && price > buyPrice * 1.38) {
        //   console.log(`🟣 Take Profit ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // } else if (holdTime > 0.8 * 60 * 1000 && price > buyPrice * 1.68) {
        //   console.log(`🟢 Take Profit ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // }
        // if (holdTime > 0.3 * 60 * 1000 && price < buyPrice * 0.58) {
        //   console.log(`⚪ Stop Loss ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // }else if (holdTime > 0.5 * 60 * 1000 && price < buyPrice * 0.84) {
        //   console.log(`🟠 Stop Loss ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // }
        // if (holdTime > 1.5 * 60 * 1000 && price < buyPrice * 1.1) {
        //   console.log(`🟡 Stop Loss ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // }
        // if (holdTime > 3 * 60 * 1000) {
        //   console.log(`🕒 Time Out ${price / buyPrice * 100}% : ${buyPrice} => ${price}`);
        //   clearInterval(priceTracker);
        //   resolve(true);
        // }
      });
    }, 400);
  });
};
