import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

def build_ml_dataset(df, max_eval_date):
    """
    Constructs the target variable (Churn) and extracts 26 behavior-based features per customer.
    No target leak variables (like Recency) are included in the feature set.
    """
    # 1. Target Label definition: Churn = 1 if inactive >= 3 days, else 0
    rfm_temp = df.groupby('Customer Name').agg({
        'Invoice Date': lambda x: (max_eval_date - x.max()).days
    }).rename(columns={'Invoice Date': 'Recency'})
    
    rfm_temp['Churn'] = (rfm_temp['Recency'] >= 3).astype(int)
    
    # 2. Behavioral Feature aggregation
    cust_feats = df.groupby('Customer Name').agg({
        'Sales Volume': 'sum',
        'Discount': lambda x: abs(x).sum(),
        'Tax': 'sum',
        'Sales Cases': 'sum',
        'Sales Pieces': 'sum',
        'Brand': 'nunique',
        'Category': 'nunique',
        'Invoice Number': 'nunique',
        'Net Amount': 'sum'
    }).rename(columns={
        'Sales Volume': 'Total_Volume',
        'Discount': 'Total_Discount',
        'Tax': 'Total_Tax',
        'Sales Cases': 'Total_Cases',
        'Sales Pieces': 'Total_Pieces',
        'Brand': 'Unique_Brands',
        'Category': 'Unique_Categories',
        'Invoice Number': 'Frequency',
        'Net Amount': 'Monetary'
    })
    
    # Join target label
    cust_feats = cust_feats.join(rfm_temp['Churn'])
    
    # Derived ratio features
    cust_feats['Avg_Order_Value'] = cust_feats['Monetary'] / cust_feats['Frequency']
    cust_feats['Discount_Rate'] = cust_feats['Total_Discount'] / (cust_feats['Monetary'] + cust_feats['Total_Discount'] + 1e-5)
    
    # Master Channel transaction proportions
    channel_counts = df.pivot_table(index='Customer Name', columns='Master Channel', values='Invoice Number', aggfunc='nunique', fill_value=0)
    for col in channel_counts.columns:
        cust_feats[f'Prop_Channel_{col}'] = channel_counts[col] / cust_feats['Frequency']
        
    # Category transaction proportions
    cat_counts = df.pivot_table(index='Customer Name', columns='Category', values='Invoice Number', aggfunc='count', fill_value=0)
    total_rows_per_cust = df.groupby('Customer Name')['Invoice Number'].count()
    cat_props = cat_counts.div(total_rows_per_cust, axis=0).add_prefix('Prop_Cat_')
    cust_feats = cust_feats.join(cat_props)
    
    # Clean potential NaNs
    cust_feats = cust_feats.fillna(0.0)
    
    return cust_feats

def train_evaluate_models(features_df):
    """
    Splits the customer base and trains both Random Forest and XGBoost.
    Returns metrics, features, and model predictors.
    """
    X = features_df.drop(columns=['Churn'])
    y = features_df['Churn']
    
    # Stratified train-test split (80/20)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # 1. Random Forest Classifier
    rf = RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)
    rf.fit(X_train, y_train)
    
    preds_rf = rf.predict(X_test)
    probs_rf = rf.predict_proba(X_test)[:, 1]
    
    metrics_rf = {
        'accuracy': float(accuracy_score(y_test, preds_rf)),
        'precision': float(precision_score(y_test, preds_rf)),
        'recall': float(recall_score(y_test, preds_rf)),
        'f1_score': float(f1_score(y_test, preds_rf)),
        'roc_auc': float(roc_auc_score(y_test, probs_rf))
    }
    
    # 2. XGBoost Classifier
    xgb = XGBClassifier(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42, eval_metric='logloss')
    xgb.fit(X_train, y_train)
    
    preds_xgb = xgb.predict(X_test)
    probs_xgb = xgb.predict_proba(X_test)[:, 1]
    
    metrics_xgb = {
        'accuracy': float(accuracy_score(y_test, preds_xgb)),
        'precision': float(precision_score(y_test, preds_xgb)),
        'recall': float(recall_score(y_test, preds_xgb)),
        'f1_score': float(f1_score(y_test, preds_xgb)),
        'roc_auc': float(roc_auc_score(y_test, probs_xgb))
    }
    
    # Retrieve features and full dataset predictions
    feature_names = list(X.columns)
    full_rf_probs = rf.predict_proba(X)[:, 1].tolist()
    full_xgb_probs = xgb.predict_proba(X)[:, 1].tolist()
    
    return {
        'rf_model': rf,
        'xgb_model': xgb,
        'rf_metrics': metrics_rf,
        'xgb_metrics': metrics_xgb,
        'feature_names': feature_names,
        'rf_probabilities': full_rf_probs,
        'xgb_probabilities': full_xgb_probs
    }

def get_feature_importances(model, feature_names):
    """
    Extracts and sorts feature importance coefficients.
    """
    importances = model.feature_importances_.tolist()
    items = [{'feature': name, 'coefficient': float(val)} for name, val in zip(feature_names, importances)]
    # Sort descending
    items = sorted(items, key=lambda x: x['coefficient'], reverse=True)
    return items

def get_customer_risk_registry(df, max_eval_date, features_df, rf_probs, xgb_probs):
    """
    Creates the live Customer Risk Registry.
    """
    # Group by customer to retrieve their basic RFM parameters
    base_info = df.groupby('Customer Name').agg({
        'Invoice Date': lambda x: (max_eval_date - x.max()).days,
        'Invoice Number': 'nunique',
        'Net Amount': 'sum'
    }).rename(columns={
        'Invoice Date': 'Recency',
        'Invoice Number': 'Frequency',
        'Net Amount': 'Monetary'
    }).reset_index()
    
    # Add Churn label and probabilities
    base_info['Churn'] = (base_info['Recency'] >= 3).astype(int)
    base_info['Prob_RF'] = rf_probs
    base_info['Prob_XGB'] = xgb_probs
    
    # Map status
    base_info['ActualStatus'] = base_info['Churn'].map({1: 'Churned', 0: 'Active'})
    
    # Format list
    registry = []
    for _, row in base_info.iterrows():
        registry.append({
            'customer_name': str(row['Customer Name']),
            'recency': int(row['Recency']),
            'frequency': int(row['Frequency']),
            'monetary': float(row['Monetary']),
            'prob_rf': float(row['Prob_RF']),
            'prob_xgb': float(row['Prob_XGB']),
            'actual_status': str(row['ActualStatus'])
        })
        
    return registry
