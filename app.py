import os
from flask import Flask, render_template, jsonify, request, redirect, url_for
import pandas as pd

# Import logic modules
from data_pipeline import (
    load_clean_data, get_filter_options, apply_filters, get_overview_kpis, get_temporal_data,
    get_top_selling_products, get_recent_transactions, get_channel_shares
)
from rfm_segmentation import get_rfm_analysis, get_segment_summary, get_3d_scatter_points
from churn_prediction import build_ml_dataset, train_evaluate_models, get_feature_importances, get_customer_risk_registry

app = Flask(__name__)

# Constants
DATA_PATH = r"C:\Users\saksh\.gemini\antigravity\scratch\data\raw\unilever_sales.csv"
MAX_TIMELINE_DATE = pd.to_datetime('2026-06-09')

# Global cached analytics
df_raw = None
filter_options = {}
rfm_summary = []
rfm_scatter = {}
churn_metrics_rf = {}
churn_metrics_xgb = {}
importances_rf = []
importances_xgb = []
churn_registry = []

def initialize_cache():
    global df_raw, filter_options, rfm_summary, rfm_scatter
    global churn_metrics_rf, churn_metrics_xgb, importances_rf, importances_xgb, churn_registry
    
    print("Initializing sales database pipeline and analytics...")
    if not os.path.exists(DATA_PATH):
        raise FileNotFoundError(f"Source file not found at: {DATA_PATH}")
        
    # Load and clean data
    df_raw = load_clean_data(DATA_PATH)
    
    # Cache filter dimensions
    filter_options = get_filter_options(df_raw)
    
    # Pre-calculate RFM
    print("Calculating RFM segments...")
    rfm_df = get_rfm_analysis(df_raw, MAX_TIMELINE_DATE)
    rfm_summary = get_segment_summary(rfm_df)
    rfm_scatter = get_3d_scatter_points(rfm_df)
    
    # Pre-train ML pipelines and cache results
    print("Training ML churn forecasting models (Random Forest & XGBoost)...")
    ml_data = build_ml_dataset(df_raw, MAX_TIMELINE_DATE)
    ml_res = train_evaluate_models(ml_data)
    
    churn_metrics_rf = ml_res['rf_metrics']
    churn_metrics_xgb = ml_res['xgb_metrics']
    
    importances_rf = get_feature_importances(ml_res['rf_model'], ml_res['feature_names'])
    importances_xgb = get_feature_importances(ml_res['xgb_model'], ml_res['feature_names'])
    
    churn_registry = get_customer_risk_registry(
        df_raw, 
        MAX_TIMELINE_DATE, 
        ml_data, 
        ml_res['rf_probabilities'], 
        ml_res['xgb_probabilities']
    )
    print("Initialization completed successfully.")

# Run initialization once on start
try:
    initialize_cache()
except Exception as e:
    print(f"CRITICAL ERROR during app initialization: {e}")

# ----------------------------------------------------
# HTML Template Routes
# ----------------------------------------------------
@app.route('/')
def index():
    return redirect(url_for('overview_page'))

@app.route('/overview')
def overview_page():
    return render_template('overview.html')

@app.route('/rfm')
def rfm_page():
    return render_template('rfm.html')

@app.route('/churn')
def churn_page():
    return render_template('churn.html')

# ----------------------------------------------------
# JSON API Routes
# ----------------------------------------------------
@app.route('/api/filter-options', methods=['GET'])
def api_filter_options():
    return jsonify(filter_options)

@app.route('/api/overview-data', methods=['POST'])
def api_overview_data():
    """
    Applies filters requested by the frontend client and returns KPIs & temporal data.
    """
    req_data = request.json or {}
    df_filtered = apply_filters(df_raw, req_data)
    
    kpis = get_overview_kpis(df_filtered)
    temporal = get_temporal_data(df_filtered)
    top_products = get_top_selling_products(df_filtered)
    recent_orders = get_recent_transactions(df_filtered)
    channel_shares = get_channel_shares(df_filtered)
    
    return jsonify({
        'kpis': kpis,
        'temporal': temporal,
        'top_products': top_products,
        'recent_orders': recent_orders,
        'channel_shares': channel_shares
    })

@app.route('/api/rfm-data', methods=['GET'])
def api_rfm_data():
    """
    Returns calculated RFM segment details and coordinate mappings.
    """
    return jsonify({
        'summary': rfm_summary,
        'scatter_points': rfm_scatter
    })

@app.route('/api/churn-data', methods=['GET'])
def api_churn_data():
    """
    Returns cached model results, test statistics, and risk registry.
    """
    return jsonify({
        'rf_metrics': churn_metrics_rf,
        'xgb_metrics': churn_metrics_xgb,
        'rf_importances': importances_rf,
        'xgb_importances': importances_xgb,
        'registry': churn_registry
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
