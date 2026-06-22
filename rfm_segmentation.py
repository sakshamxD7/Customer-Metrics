import pandas as pd
import numpy as np

def calculate_rfm_metrics(df, max_date):
    """
    Aggregates transactions at the customer level to compute Recency, Frequency, and Monetary metrics.
    """
    rfm = df.groupby('Customer Name').agg({
        'Invoice Date': lambda x: (max_date - x.max()).days,
        'Invoice Number': 'nunique',
        'Net Amount': 'sum'
    }).rename(columns={
        'Invoice Date': 'Recency',
        'Invoice Number': 'Frequency',
        'Net Amount': 'Monetary'
    })
    return rfm

def assign_rfm_scores(rfm_df):
    """
    Scores Recency (custom mapped 1-5) and Frequency & Monetary (rank-based quintiles 1-5).
    """
    # Recency scores: lower days = higher score
    rfm_df['R_Score'] = rfm_df['Recency'].map({0: 5, 1: 4, 2: 3, 3: 2}).fillna(1).astype(int)
    
    # Frequency and Monetary scores using rank-based percentiles
    rfm_df['F_Score'] = pd.qcut(rfm_df['Frequency'].rank(method='first'), 5, labels=[1, 2, 3, 4, 5]).astype(int)
    rfm_df['M_Score'] = pd.qcut(rfm_df['Monetary'].rank(method='first'), 5, labels=[1, 2, 3, 4, 5]).astype(int)
    
    return rfm_df

def segment_customer(row):
    """
    Classifies customers into logical segments based on RFM scores.
    """
    r, f, m = row['R_Score'], row['F_Score'], row['M_Score']
    
    if r >= 4 and f >= 4 and m >= 4:
        return 'Champions'
    elif r >= 3 and f >= 3:
        return 'Loyal Customers'
    elif r >= 3 and f < 3:
        return 'Potential Loyalists'
    elif r < 3 and f >= 3:
        return 'At Risk'
    elif r < 3 and f < 3 and m >= 3:
        return 'Need Attention'
    else:
        return 'Hibernating / Lost'

def get_rfm_analysis(df, max_date):
    """
    Performs the full RFM pipeline: metrics, scoring, segmenting, and summaries.
    """
    rfm = calculate_rfm_metrics(df, max_date)
    rfm = assign_rfm_scores(rfm)
    rfm['Segment'] = rfm.apply(segment_customer, axis=1)
    return rfm

def get_segment_summary(rfm_df):
    """
    Calculates statistical averages and customer distribution percentages for each segment.
    """
    summary = rfm_df.groupby('Segment').agg({
        'Recency': ['count', 'mean'],
        'Frequency': 'mean',
        'Monetary': 'mean'
    }).reset_index()
    
    summary.columns = ['Segment', 'CustomersCount', 'AvgRecency', 'AvgFrequency', 'AvgMonetary']
    summary['Percentage'] = (summary['CustomersCount'] / len(rfm_df)) * 100
    
    # Enforce standard presentation order
    segment_order = ['Champions', 'Loyal Customers', 'Potential Loyalists', 'At Risk', 'Need Attention', 'Hibernating / Lost']
    summary['Segment'] = pd.Categorical(summary['Segment'], categories=segment_order, ordered=True)
    summary = summary.sort_values('Segment').reset_index(drop=True)
    
    # Format for JSON response
    results = []
    for _, row in summary.iterrows():
        results.append({
            'segment': str(row['Segment']),
            'count': int(row['CustomersCount']),
            'percentage': f"{row['Percentage']:.1f}%",
            'avg_recency': f"{row['AvgRecency']:.1f} days",
            'avg_frequency': f"{row['AvgFrequency']:.2f} orders",
            'avg_monetary': f"£{row['AvgMonetary']:,.2f}"
        })
        
    return results

def get_3d_scatter_points(rfm_df):
    """
    Formats the 3D scatter coordinate array for transmission to Plotly.js on the frontend.
    """
    rfm_reset = rfm_df.reset_index()
    
    # We return lists of individual values for high-performance rendering in Plotly.js
    return {
        'customers': rfm_reset['Customer Name'].tolist(),
        'recency': rfm_reset['Recency'].tolist(),
        'frequency': rfm_reset['Frequency'].tolist(),
        'monetary': rfm_reset['Monetary'].tolist(),
        'monetary_log': np.log10(rfm_reset['Monetary'] + 1).tolist(),
        'segments': rfm_reset['Segment'].tolist()
    }
