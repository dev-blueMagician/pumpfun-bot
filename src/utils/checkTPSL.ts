import { getPrice } from "./getPrice";

export const checkTPSL = (
  curveAddress: string,
  buyPrice: number
): Promise<boolean> => {
  return new Promise((resolve) => {
    setInterval(() => {
      console.log("Checking TPSL");
      console.log(`Curve address: ${curveAddress}`);
      console.log(`Buy price: ${buyPrice}`);
      getPrice(curveAddress).then((price) => {
        console.log(`Current price: ${price}`);
        if (price < buyPrice) {
          console.log("TPSL reached");
        }
      });
      resolve(true);
    }, 400);
  });
};
