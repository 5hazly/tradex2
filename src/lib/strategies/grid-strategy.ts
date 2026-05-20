export const gridStrategy = {
  name: "Grid Trading",
  type: "GRID",
  execute: async (marketData: any, params: any) => {
    const { price } = marketData;
    const gridLevels = params.gridLevels || 5;
    
    if (price % params.gridInterval === 0) {
      return { action: "BUY", quantity: params.amount / gridLevels };
    }
    return { action: "HOLD" };
  }
};