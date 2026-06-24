# Unilever Wholesale Analytics Dashboard

> **Live Demo → [customer-metrics.onrender.com](https://customer-metrics.onrender.com/overview)**

A full-stack analytics dashboard built on a Unilever wholesale distribution dataset. Covers sales intelligence, RFM customer segmentation, and dual-model ML churn prediction — all served through a Flask REST API with a Plotly.js frontend.

---

## Screenshots

<!-- Add screenshots here -->

| Overview |
|<img width="1919" height="958" alt="image" src="https://github.com/user-attachments/assets/10cf9b8a-bd78-4700-9826-5aa8bc4fbc85" />|
| RFM Segmentation |
|<img width="1912" height="961" alt="image" src="https://github.com/user-attachments/assets/28db2746-cdb3-4464-a3c1-06ffedbf7533" />|
| Churn Prediction |
|<img width="1919" height="957" alt="image" src="https://github.com/user-attachments/assets/8dbe9805-2cf9-44a9-90c7-0b1d64fde2a5" />|


---

## Pages

**Overview** — KPI cards (revenue, orders, customers, AOV), daily revenue trend, top-5 products, channel distribution donut, recent transactions table. Fully filterable by Category, Brand, and Master Channel.

**RFM Segmentation** — Customers scored and classified into 6 segments (Champions → Hibernating/Lost) using Recency, Frequency, and Monetary metrics. Includes a live 3D Plotly scatter plot and a segment summary table.

**Churn Prediction** — Random Forest and XGBoost trained on 26 behavioral features per customer. Side-by-side model metrics (Accuracy, Precision, Recall, F1, ROC-AUC), feature importance charts, and a customer-level risk registry with churn probability scores from both models.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│           HTML/CSS + Vanilla JS + Plotly.js charts              │
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTP (GET / POST + JSON)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      FLASK APPLICATION                          │
│                                                                 │
│   Route Layer (app.py)                                          │
│   ├── GET  /overview, /rfm, /churn  → HTML templates           │
│   ├── GET  /api/filter-options      → dropdown values           │
│   ├── POST /api/overview-data       → KPIs + chart data         │
│   ├── GET  /api/rfm-data            → segments + scatter pts    │
│   └── GET  /api/churn-data          → model metrics + registry  │
│                                                                 │
│   Analytics Modules (pre-computed at startup, held in memory)  │
│   ├── data_pipeline.py   → CSV load, clean, filter, aggregate  │
│   ├── rfm_segmentation.py → RFM scoring, segment assignment    │
│   └── churn_prediction.py → feature engineering, ML training   │
└───────────────────────────┬─────────────────────────────────────┘
                            │  pandas / sklearn / xgboost
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                              │
│              unilever_sales.csv  (~6MB, 35K+ rows)              │
│   Columns: Invoice Date · Customer Name · Master Channel ·      │
│   Category · Brand · Product Description · Sales Volume ·       │
│   Net Amount · Discount · Tax · Sales Cases · Sales Pieces      │
└─────────────────────────────────────────────────────────────────┘
```

**Startup flow:** On boot, the app runs `initialize_cache()` — loads and cleans the CSV, pre-computes RFM segments, trains both ML models, builds the risk registry — and holds all results in memory. API routes then serve from cache with zero recomputation per request.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, Flask 3.x |
| ML | scikit-learn (Random Forest), XGBoost |
| Data | pandas, NumPy |
| Frontend | Vanilla HTML/CSS/JS, Plotly.js |
| Deployment | Render |

---

## Project Structure

```
unilever_dashboard/
├── app.py                   # Flask routes + startup cache
├── data_pipeline.py         # Cleaning, filtering, KPI aggregation
├── rfm_segmentation.py      # RFM scoring and segment classification
├── churn_prediction.py      # Feature engineering, model training, risk registry
├── requirements.txt
├── vercel.json
├── unilever_sales.csv
├── templates/
│   ├── base.html
│   ├── overview.html
│   ├── rfm.html
│   └── churn.html
└── static/
    ├── css/style.css
    └── js/main.js
```

---

## Run Locally

```bash
git clone https://github.com/YOUR_USERNAME/unilever-dashboard.git
cd unilever-dashboard
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

---

## Author

**Saksham Jangir**  
B.Tech CSE (Data Analytics) — JECRC University, Jaipur  
[LinkedIn](https://linkedin.com/in/YOUR_PROFILE) · [GitHub](https://github.com/YOUR_USERNAME)
