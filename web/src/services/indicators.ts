// Mathematical Technical Indicators for MiND-Shot Strategy Logic

export function calculateSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const k = 2 / (period + 1);
  let prevEma = 0;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      prevEma += data[i];
    } else if (i === period - 1) {
      prevEma = (prevEma + data[i]) / period;
      result.push(prevEma);
    } else {
      const ema = data[i] * k + prevEma * (1 - k);
      result.push(ema);
      prevEma = ema;
    }
  }
  return result;
}

export function calculateBollingerBands(
  prices: number[],
  period = 20,
  stdDevMultiplier = 2.0
): { middle: number[]; upper: number[]; lower: number[]; percentB: number[]; bandwidth: number[] } {
  const sma = calculateSMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  const percentB: number[] = [];
  const bandwidth: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (isNaN(sma[i])) {
      upper.push(NaN);
      lower.push(NaN);
      percentB.push(NaN);
      bandwidth.push(NaN);
      continue;
    }

    let varianceSum = 0;
    for (let j = 0; j < period; j++) {
      varianceSum += Math.pow(prices[i - j] - sma[i], 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    const up = sma[i] + stdDevMultiplier * stdDev;
    const lo = sma[i] - stdDevMultiplier * stdDev;

    upper.push(up);
    lower.push(lo);
    bandwidth.push(((up - lo) / sma[i]) * 100);

    const pb = up !== lo ? (prices[i] - lo) / (up - lo) : 0.5;
    percentB.push(pb);
  }

  return { middle: sma, upper, lower, percentB, bandwidth };
}

export function calculateRSI(prices: number[], period = 14): number[] {
  const result: number[] = [];
  if (prices.length <= period) return prices.map(() => 50);

  const changes: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const chg = changes[i];
    if (chg > 0) avgGain += chg;
    else avgLoss += Math.abs(chg);
  }
  avgGain /= period;
  avgLoss /= period;

  result.push(...new Array(period).fill(NaN));
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));

  for (let i = period; i < changes.length; i++) {
    const chg = changes[i];
    const gain = chg > 0 ? chg : 0;
    const loss = chg < 0 ? Math.abs(chg) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const currentRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + currentRs));
  }

  return result;
}

export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number[] {
  const tr: number[] = [highs[0] - lows[0]];

  for (let i = 1; i < closes.length; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];
    const trueRange = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    tr.push(trueRange);
  }

  const atr: number[] = [];
  let sum = 0;
  for (let i = 0; i < period && i < tr.length; i++) {
    sum += tr[i];
    atr.push(sum / (i + 1));
  }

  for (let i = period; i < tr.length; i++) {
    const prevAtr = atr[i - 1];
    const currAtr = (prevAtr * (period - 1) + tr[i]) / period;
    atr.push(currAtr);
  }

  return atr;
}

export function calculateADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = closes.length;
  if (n < period * 2) {
    return {
      adx: closes.map(() => 22.0),
      plusDI: closes.map(() => 20.0),
      minusDI: closes.map(() => 20.0),
    };
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < n; i++) {
    const h = highs[i];
    const l = lows[i];
    const ph = highs[i - 1];
    const pl = lows[i - 1];
    const pc = closes[i - 1];

    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));

    const upMove = h - ph;
    const downMove = pl - l;

    if (upMove > downMove && upMove > 0) plusDM.push(upMove);
    else plusDM.push(0);

    if (downMove > upMove && downMove > 0) minusDM.push(downMove);
    else minusDM.push(0);
  }

  // Smooth TR, +DM, -DM
  let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const plusDI: number[] = [NaN];
  const minusDI: number[] = [NaN];
  const dx: number[] = [];

  for (let i = period; i < tr.length; i++) {
    smoothTR = smoothTR - smoothTR / period + tr[i];
    smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
    smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

    const pDI = (smoothPlusDM / smoothTR) * 100;
    const mDI = (smoothMinusDM / smoothTR) * 100;
    plusDI.push(pDI);
    minusDI.push(mDI);

    const diDiff = Math.abs(pDI - mDI);
    const diSum = pDI + mDI;
    dx.push(diSum === 0 ? 0 : (diDiff / diSum) * 100);
  }

  // Calculate ADX
  const adxResult: number[] = new Array(period * 2).fill(NaN);
  let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  adxResult.push(adxVal);

  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period;
    adxResult.push(adxVal);
  }

  return { adx: adxResult, plusDI, minusDI };
}

export function calculateZScore(prices: number[], period = 20): number[] {
  const sma = calculateSMA(prices, period);
  const zScores: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (isNaN(sma[i])) {
      zScores.push(NaN);
      continue;
    }
    let variance = 0;
    for (let j = 0; j < period; j++) {
      variance += Math.pow(prices[i - j] - sma[i], 2);
    }
    const stdDev = Math.sqrt(variance / period);
    const z = stdDev === 0 ? 0 : (prices[i] - sma[i]) / stdDev;
    zScores.push(parseFloat(z.toFixed(4)));
  }

  return zScores;
}
