# 🌾 GreenCrop 2.0 — AI Yield Prediction & Leaf Health (3D Web App)

> 🚀 **Full-stack product:** Express + PostgreSQL + JWT auth · 3D animated UI · regression yield model · client-side leaf health analysis
> Deploy on Render: set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` env vars · Build `npm install` · Start `npm start`
> Old prototype preserved in [`legacy/`](legacy/)

# 🌾 GreenCrop — Crop Yield Prediction System

An **end-to-end machine learning pipeline** that predicts crop yields from real agricultural data,
helping farmers and agronomists make data-driven planting decisions.

> Built by [Bonugu Sai Kiran Manideep](https://manideep-2006.github.io/my-portfolio/) ·
> B.Tech CSE (Data Science), VIIT Visakhapatnam

---

## 🎯 What it does

- Predicts **crop yield** from features like rainfall, temperature, soil type, fertilizer usage and region
- Trained and evaluated on **10,000+ rows** of real-world agricultural data
- Compares **Random Forest** and **Linear Regression** models via Scikit-learn
- Achieved **~18% accuracy improvement** through systematic feature engineering, normalization and hyperparameter tuning
- Validated with **RMSE** and **R²** evaluation metrics

## 🧠 ML Pipeline

```
Raw dataset
  → Data cleaning (missing-value imputation, outlier treatment)
  → Feature engineering & scaling
  → Train/test split
  → Model training (Random Forest · Linear Regression)
  → Hyperparameter tuning
  → Evaluation (RMSE, R²)
  → Yield prediction
```

## 🧰 Tech Stack

| Layer | Tools |
|---|---|
| Language | Python |
| ML | Scikit-learn (RandomForestRegressor, LinearRegression) |
| Data | Pandas, NumPy |
| Visualization | Matplotlib, Seaborn |
| Serving (demo UI) | Node.js + SQLite |

## 🚀 Run it

```bash
# clone
git clone https://github.com/MANIDEEP-2006/green-crop-yeild-detection.git
cd green-crop-yeild-detection

# demo web UI
npm install
node server.js
# open http://localhost:3000
```

The ML notebook/training code lives in the project archive — open it in Jupyter/Colab to retrain models.

## 📊 Results

| Metric | Before tuning | After feature engineering + tuning |
|---|---|---|
| Model accuracy | baseline | **~18% better** |
| Validation | — | RMSE + R² verified |

## 👤 Author

**Bonugu Sai Kiran Manideep**
[Portfolio](https://manideep-2006.github.io/my-portfolio/) · [LinkedIn](https://linkedin.com/in/b-sai-kiran-manideep-62716a317) · manideep1716@gmail.com
