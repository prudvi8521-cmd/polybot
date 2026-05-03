Comprehensive Trading Indicators Guide

1. BOLLINGER BANDS & BANDWIDTH
Overview
Bollinger Bands were developed by John Bollinger in the 1980s. They are one of the most widely used technical analysis tools in the world, applicable across all asset classes — stocks, forex, crypto, commodities — and all timeframes.
The core idea: price is relatively high when near the upper band and relatively low when near the lower band. The bands are dynamic — they widen and contract based on market volatility — making them far more nuanced than static support/resistance levels.

Formula
MB=SMA(n),UB=MB+(k×σ),LB=MB−(k×σ)MB = SMA(n), \quad UB = MB + (k \times \sigma), \quad LB = MB - (k \times \sigma)MB=SMA(n),UB=MB+(k×σ),LB=MB−(k×σ)
Symbols:

MB = Middle Band (20-period SMA by default)
UB = Upper Band
LB = Lower Band
k = multiplier (default = 2)
σ = Standard Deviation of price over n periods
n = number of periods (default = 20)

Bandwidth Formula
BW=UB−LBMB×100BW = \frac{UB - LB}{MB} \times 100BW=MBUB−LB​×100

BW = Bandwidth percentage — how wide the bands are relative to the middle


Key Concepts & Signals
The Squeeze:
When bandwidth reaches a multi-month low, the market is coiling up energy. Called the "Bollinger Squeeze" — one of the most powerful setups in technical analysis. It doesn't tell direction, only that a big move is coming. Traders wait for a decisive candle to break above or below the bands.
Walking the Bands:
In strong trends, price can "walk" along the upper or lower band for extended periods. This is NOT automatically a reversal signal. Repeatedly touching the upper band in an uptrend is a sign of strength, not excess.
Mean Reversion:
When price touches the upper band and RSI is simultaneously overbought, it suggests a pullback to the middle band (20 SMA) — which acts as dynamic support/resistance.
%B Indicator:
Tells you exactly where price is within the bands:

%B above 1.0 = price above upper band
%B at 0.5 = price at middle band
%B below 0 = price below lower band


Settings & Customization
Use CasePeriodStdDevDefault swing trading202.0Short-term / scalping101.5Long-term / position502.5Crypto (high volatility)202.5–3.0

Common Mistakes

Treating upper band as always a "sell" — wrong in strong trends
Ignoring bandwidth — bands without context are incomplete
Using alone without a trend or volume filter



2. DAX (Directional Strength Indicator)
Overview
The DAX (Directional Movement Index) measures the strength and direction of a trend. Developed by J. Welles Wilder Jr. in 1978, it answers two critical questions:

Is the market trending at all?
In which direction?

It removes subjectivity and gives a quantified measure of trend power.

Formula
+DI=+DM14TR14×100,−DI=−DM14TR14×100+DI = \frac{+DM_{14}}{TR_{14}} \times 100, \quad -DI = \frac{-DM_{14}}{TR_{14}} \times 100+DI=TR14​+DM14​​×100,−DI=TR14​−DM14​​×100
DX=∣+DI−(−DI)∣∣+DI+(−DI)∣×100,DAX=Smoothed Average of DXDX = \frac{|+DI - (-DI)|}{|+DI + (-DI)|} \times 100, \quad DAX = \text{Smoothed Average of DX}DX=∣+DI+(−DI)∣∣+DI−(−DI)∣​×100,DAX=Smoothed Average of DX
Symbols:

+DI = Positive Directional Indicator — strength of upward movement
−DI = Negative Directional Indicator — strength of downward movement
+DM = Positive Directional Movement — how much today's high exceeded yesterday's high
−DM = Negative Directional Movement — how much today's low fell below yesterday's low
TR = True Range — largest of: current high-low, high-prev close, low-prev close
DX = Raw Directional Index before smoothing
DAX = Smoothed DX — the final trend strength line (0 to 100)


Reading DAX Values
DAX ValueTrend Strength0 – 20No trend / Ranging market20 – 25Emerging / weak trend25 – 50Strong trend — best for trend following50 – 75Very strong trend75 – 100Extremely strong — exhaustion possible

⚠️ DAX measures strength only — not direction. +DI and −DI tell you direction.


Trading Signals
DI Crossover:

+DI crosses above −DI → Bullish → potential buy
−DI crosses above +DI → Bearish → potential sell
Only valid when DAX is above 20–25

DAX Rising from Below 20:
New trend being born — one of the strongest entry signals when combined with a DI crossover.
DAX Declining from High Levels:
Trend losing momentum. Not necessarily reversing but time to tighten stops or take partial profits.
DAX Below 20:
Switch to mean reversion strategies — trend-following fails here. Use Bollinger Bands and RSI extremes instead.

DI Separation Analysis

Wide gap between +DI and −DI = very directional, powerful trend
Narrow gap / crossing = indecision, transition phase
Both DI lines low and close = dead ranging market, lowest probability for trend trades


Common Mistakes

Acting on DI crossovers when DAX is below 20 — false signals in ranging markets
Thinking high DAX = buy — a DAX of 60 with −DI dominant means a very strong downtrend
Using too short a period — Wilder's 14-period is the standard



3. RSI (Relative Strength Index)
Overview
Developed by J. Welles Wilder Jr. in 1978, RSI measures the speed and magnitude of recent price changes to identify overbought and oversold conditions on a scale of 0 to 100. Despite being 45+ years old, it remains one of the most used indicators in modern trading across every asset class.

Formula
RS=Average GainAverage Loss,RSI=100−1001+RSRS = \frac{\text{Average Gain}}{\text{Average Loss}}, \quad RSI = 100 - \frac{100}{1 + RS}RS=Average LossAverage Gain​,RSI=100−1+RS100​
Symbols:

RS = Relative Strength — ratio of average gains to average losses
Average Gain = Mean of all up-closes over n periods (default 14)
Average Loss = Mean of all down-closes over n periods (absolute value)
n = Lookback period (default = 14, using Wilder's smoothing method)
RSI = Final oscillator value ranging from 0 to 100


Key Levels
RSI LevelInterpretationAbove 70Overbought — potential reversal or pullback50 – 70Bullish momentum zone50Neutral — trend inflection point30 – 50Bearish momentum zoneBelow 30Oversold — potential bounce or reversal

Advanced Signals
RSI Divergence — Most Powerful Signal:

Bullish Divergence — Price makes lower low, RSI makes higher low → momentum slowing, upward reversal likely
Bearish Divergence — Price makes higher high, RSI makes lower high → buying pressure fading, downward reversal likely
Hidden Bullish Divergence — Price makes higher low, RSI makes lower low → uptrend continuation signal
Hidden Bearish Divergence — Price makes lower high, RSI makes higher high → downtrend continuation signal

RSI Failure Swings (Wilder's Preferred Signal):

Bullish: RSI drops below 30 → bounces → pulls back but stays above 30 → breaks above prior swing high = buy
Bearish: RSI rises above 70 → drops → rallies but stays below 70 → breaks below prior swing low = sell

RSI Centerline (50) Crossover:

RSI crossing above 50 = bullish trend confirmation
RSI crossing below 50 = bearish trend confirmation

RSI Trendlines:
Drawing trendlines directly on the RSI — when RSI breaks its own trendline, price often follows shortly after. An early warning system.

Period Settings
Trading StylePeriodScalping7 – 9Swing Trading14 (default)Position Trading21 – 25

Common Mistakes

Selling just because RSI is above 70 in a strong uptrend — can stay overbought for weeks
Ignoring divergence signals — the most reliable RSI setups
Not adjusting period for the timeframe being traded



4. OBV (On-Balance Volume)
Overview
Developed by Joseph Granville in 1963, OBV was one of the first indicators to use volume as a predictive tool. The foundational principle:

"Volume is the steam that drives the locomotive — price."

The core idea: institutional money moves markets. When big players accumulate positions, volume surges on up days before price fully reflects the buying. OBV captures this hidden accumulation or distribution.

Formula
OBVt=OBVt−1+{+Vif price closes up0if price unchanged−Vif price closes downOBV_t = OBV_{t-1} + \begin{cases} +V & \text{if price closes up} \\ 0 & \text{if price unchanged} \\ -V & \text{if price closes down} \end{cases}OBVt​=OBVt−1​+⎩⎨⎧​+V0−V​if price closes upif price unchangedif price closes down​
Symbols:

OBV_t = Current OBV value
OBV_{t-1} = Previous period's OBV value
+V = Volume added when price closes higher than previous close
−V = Volume subtracted when price closes lower than previous close
The absolute value of OBV is irrelevant — only the trend and direction matter


Key Signals
OBV Confirmation:

Rising OBV + Rising Price = Strong uptrend — volume supports price move
Falling OBV + Falling Price = Strong downtrend — volume supports decline

OBV Divergence:

Rising price + Falling OBV = Bearish divergence — rally not supported by volume, reversal warning
Falling price + Rising OBV = Bullish divergence — selling is weakening, accumulation beneath the surface

OBV Breakout (Leading Signal):
OBV frequently breaks out of patterns — trendlines, ranges — before price does. Drawing trendlines directly on OBV gives early warning of upcoming price moves. This is its most powerful use.
OBV and Moving Averages:
Applying a moving average (e.g., 20 EMA) to OBV itself helps filter noise. When OBV crosses above its MA → bullish. When it crosses below → bearish.

OBV Accumulation vs. Distribution
ScenarioWhat It MeansPrice flat + OBV risingStealth accumulation — big players buying quietlyPrice flat + OBV fallingStealth distribution — big players selling quietlyPrice rising + OBV risingHealthy trend with convictionPrice rising + OBV flat/fallingWeak rally — smart money not participating

Limitations

Treats all volume equally regardless of where in the candle price moved
One high-volume day can significantly distort the OBV line
Works best in conjunction with price action and trend tools



5. OI (Open Interest)
Overview
Open Interest (OI) is unique to derivatives markets (futures and options). It represents the total number of active outstanding contracts that have been opened but not yet closed, expired, or delivered.
Unlike volume which resets daily, OI is cumulative — it builds up over time and reflects the total level of market participation and commitment. It answers: "How much real money is committed to this market right now?"

Formula
OIend=OIstart+New Contracts Opened−Contracts Closed/ExpiredOI_{end} = OI_{start} + \text{New Contracts Opened} - \text{Contracts Closed/Expired}OIend​=OIstart​+New Contracts Opened−Contracts Closed/Expired
Symbols:

OI = Total outstanding/active derivative contracts at any point
New Contracts = Added when both buyer AND seller are new to the market
Closed Contracts = Removed when an existing position is offset or expires
OI is unchanged when an old participant transfers their position to a new one


The Core OI + Price Matrix
PriceOpen InterestInterpretation↑ Rising↑ RisingStrong uptrend — new longs entering with conviction↓ Falling↑ RisingStrong downtrend — new shorts entering aggressively↑ Rising↓ FallingWeak rally — short covering only, not genuine buying↓ Falling↓ FallingWeak decline — long liquidation, trend may be ending

OI in Options Markets
Max Pain Theory:
The price level where the maximum number of options expire worthless — causing maximum loss to option buyers. Strikes with massive OI act as gravitational price magnets, especially near expiration. Market makers hedge toward these levels.
Put/Call OI Ratio (PCR):
PCR=Total Put OITotal Call OIPCR = \frac{\text{Total Put OI}}{\text{Total Call OI}}PCR=Total Call OITotal Put OI​


Implied Volatility (IV) acts as a "Price Tag" for fear. It tells you if the increasing Put/Call Ratio (PCR) is caused by desperate buyers (bearish) or greedy sellers (bullish).

High Demand: When investors aggressively buy options (driving the price up), the calculated IV must increase to justify that higher price.Low Demand: When traders sell off options (driving the price down), the calculated IV decreases

IV is calculated separately for every single option contract on the board.
"Total IV" is a weighted average that usually follows whichever side has the most aggression and volume. But can be violated on Market exceptions


| PCR | IV | Likely Action | Market Outlook |
|---|---|---|---|
| Rising | Rising | Buying Puts | Bearish (Real Fear) |
| Rising | Falling | Selling Puts | Bullish (Support/Floor) |
| Falling | Rising | Buying Calls | Strong Bullish (Momentum) |
| Falling | Falling | Selling Calls/Exiting | Cautious (Complacency) |


Exception: 
When you see Falling PCR + Rising IV, you must look at the Price Action to know which rule applies:
| Scenario | PCR | IV | Interpretation |
|---|---|---|---|
| Upward Trend | Falling | Rising | Strong Bullish — aggressive call buying (FOMO) |
| Sharp Sell-off | Falling | Rising | Bearish Trap — short covering/liquidity hunt ("The Tank") |

In the above scenario, Total IV is dominated by puts due to their higher premiums and not calls instead of volume difference.
Instead of one average IV, professional traders look at the 25-delta Risk Reversal (RR), which compares the IV of out-of-the-money (OTM) puts vs. OTM calls.


COT Report (Commitment of Traders):
Published weekly by the CFTC, breaks OI down by participant type:

Commercials (hedgers) — usually contrarian signals at extremes
Non-commercials (large speculators) — follow their direction
Non-reportable (small retail) — often wrong at extremes

Extreme speculator positioning historically precedes major reversals.







Combined Strategy Framework
IndicatorRole in StrategyDAXIs there a trend worth trading? (>25 = yes)RSITime the entry — overbought/oversold + divergenceBollinger BandsIdentify volatility environment and key levelsBandwidthDetect squeeze setups before breakoutsOBVConfirm volume is supporting the moveOIConfirm real money/commitment behind the move

A high-conviction trade has: DAX trending + RSI confirming + OBV rising + OI rising + price breaking out of a Bollinger squeeze.