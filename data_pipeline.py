import pandas as pd
import numpy as np

def clean_numeric(series):
    """
    Cleans strings representing comma-separated numeric values and converts them to floats.
    """
    return pd.to_numeric(
        series.astype(str)
        .str.replace(',', '', regex=False)
        .str.replace('"', '', regex=False)
        .str.replace('$', '', regex=False)
        .str.strip(),
        errors='coerce'
    ).fillna(0.0)

def load_clean_data(file_path):
    """
    Reads the raw sales CSV, cleans all numeric and string columns, and parses dates.
    """
    df = pd.read_csv(file_path)
    
    # Clean numeric columns
    numeric_cols = ['Sales Volume', 'Sales Value', 'Discount', 'Tax', 'Net Amount', 'Sales Cases', 'Sales Pieces']
    for col in numeric_cols:
        df[col] = clean_numeric(df[col])
        
    # Clean date column
    df['Invoice Date'] = pd.to_datetime(df['Invoice Date'], format='%d/%m/%Y')
    
    # Strip string columns
    for col in df.select_dtypes(include=['object']).columns:
        df[col] = df[col].astype(str).str.strip()
        
    return df

def get_filter_options(df):
    """
    Returns unique values of key dimensions for populating frontend dropdowns.
    """
    return {
        'categories': sorted(df['Category'].unique().tolist()),
        'brands': sorted(df['Brand'].unique().tolist()),
        'channels': sorted(df['Master Channel'].unique().tolist())
    }

def apply_filters(df, filters):
    """
    Filters the DataFrame dynamically based on client requests.
    """
    df_filtered = df.copy()
    
    # Filter by Minimum Net Amount
    min_amount = float(filters.get('min_amount', 0.0))
    df_filtered = df_filtered[df_filtered['Net Amount'] >= min_amount]
    
    # Filter by Categories
    categories = filters.get('categories')
    if categories and categories != 'ALL' and 'ALL' not in categories:
        if isinstance(categories, str):
            categories = [categories]
        df_filtered = df_filtered[df_filtered['Category'].isin(categories)]
        
    # Filter by Brands
    brands = filters.get('brands')
    if brands and brands != 'ALL' and 'ALL' not in brands:
        if isinstance(brands, str):
            brands = [brands]
        df_filtered = df_filtered[df_filtered['Brand'].isin(brands)]
        
    # Filter by Channels (Master Channel)
    channels = filters.get('channels')
    if channels and channels != 'ALL' and 'ALL' not in channels:
        if isinstance(channels, str):
            channels = [channels]
        df_filtered = df_filtered[df_filtered['Master Channel'].isin(channels)]
        
    return df_filtered

def get_overview_kpis(df_filtered):
    """
    Computes summary metrics for Overview KPI cards.
    """
    if df_filtered.empty:
        return {
            'net_revenue': 0.0,
            'customer_count': 0,
            'avg_order_value': 0.0,
            'order_count': 0
        }
        
    net_revenue = float(df_filtered['Net Amount'].sum())
    customer_count = int(df_filtered['Customer Name'].nunique())
    
    # AOV = Net Revenue / Unique Invoices
    invoice_count = df_filtered['Invoice Number'].nunique()
    avg_order_value = net_revenue / invoice_count if invoice_count > 0 else 0.0
    
    return {
        'net_revenue': net_revenue,
        'customer_count': customer_count,
        'avg_order_value': avg_order_value,
        'order_count': int(invoice_count)
    }

def get_temporal_data(df_filtered):
    """
    Groups filtered data by day and formats it for line chart visualization.
    """
    if df_filtered.empty:
        return {'dates': [], 'revenue': [], 'orders': [], 'customers': []}
        
    daily = df_filtered.groupby('Invoice Date').agg({
        'Net Amount': 'sum',
        'Invoice Number': 'nunique',
        'Customer Name': 'nunique'
    }).reset_index().sort_values('Invoice Date')
    
    return {
        'dates': daily['Invoice Date'].dt.strftime('%Y-%m-%d').tolist(),
        'revenue': daily['Net Amount'].tolist(),
        'orders': daily['Invoice Number'].tolist(),
        'customers': daily['Customer Name'].tolist()
    }

def get_top_selling_products(df_filtered):
    """
    Identifies the top 5 product descriptions by cumulative net spend value.
    """
    if df_filtered.empty:
        return []
    top = df_filtered.groupby(['Product Description', 'Brand'])['Net Amount'].sum().reset_index()
    top = top.sort_values('Net Amount', ascending=False).head(5)
    return [{
        'product': str(row['Product Description']),
        'brand': str(row['Brand']),
        'revenue': float(row['Net Amount'])
    } for _, row in top.iterrows()]

def get_recent_transactions(df_filtered):
    """
    Retrieves the 5 most recent sales records for visual confirmation.
    """
    if df_filtered.empty:
        return []
    # Sort by Date descending and grab the top 5
    recent = df_filtered.sort_values(by=['Invoice Date', 'Invoice Number'], ascending=False).head(5)
    return [{
        'invoice_number': str(row['Invoice Number']),
        'date': row['Invoice Date'].strftime('%Y-%m-%d'),
        'product': str(row['Product Description']),
        'brand': str(row['Brand']),
        'quantity': int(row['Sales Pieces'] + row['Sales Cases']),
        'revenue': float(row['Net Amount']),
        'channel': str(row['Master Channel'])
    } for _, row in recent.iterrows()]

def get_channel_shares(df_filtered):
    """
    Calculates cumulative order counts per Master Channel for the donut chart.
    """
    if df_filtered.empty:
        return {'labels': [], 'values': []}
    shares = df_filtered.groupby('Master Channel')['Invoice Number'].nunique().reset_index()
    return {
        'labels': shares['Master Channel'].tolist(),
        'values': shares['Invoice Number'].tolist()
    }
