# PMT Terminal

A comprehensive, web-based trading terminal built for the Portfolio Management Team (PMT) and ACM@UIC SIG Algorithmic Trading.

**Live Demo:** [https://tutuleman.github.io/PMT-TRADING/](https://tutuleman.github.io/PMT-TRADING/)

## Features

- **Real-Time Charts & Analytics**: View live market data, order book depth, sector heatmaps, and apply technical indicators (RSI, MACD) to your charts.
- **Backtesting Engine**: Test your trading strategies directly in the browser with customizable parameters, detailed trade logs, and performance metrics (Sharpe, Max Drawdown, CAGR).
- **Economic Calendar**: Explore an interactive world map visualizing upcoming IPOs, SEC filings, and global economic events.
- **Study Materials**: Access curated resources, essential books, UIC research papers, and coding guides tailored for quantitative finance.
- **Arcade**: Take a quick break with built-in games including Chess and Texas Hold'em.

## API Requirements

To run the terminal with full live data capabilities, you will need three free API keys (this setup distributes data requests to prevent hitting rate limits):
1. **[Finnhub](https://finnhub.io/)**: For live quotes, news, sector data, and calendar events.
2. **[Massive](https://massive.com/)**: For previous-day and historical stock bars.
3. **[EODHD](https://eodhd.com/)**: For historical EOD data and performance metrics.
