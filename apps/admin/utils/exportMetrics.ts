import html2canvas from 'html2canvas';

export const exportAsCsv = (data: any[], filename: string) => {
  if (!data || data.length === 0) {
    alert("No data available to export.");
    return;
  }
  
  // Extract headers
  const headers = Object.keys(data[0]);
  
  // Convert rows to CSV string
  const csvRows = [];
  csvRows.push(headers.join(',')); // Add headers row
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      // Wrap strings in quotes, escape inner quotes
      if (typeof val === 'string') {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvRows.push(values.join(','));
  }
  
  const csvString = csvRows.join('\n');
  
  // Create download link
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const exportAsPng = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found.`);
    return;
  }
  
  try {
    const canvas = await html2canvas(element, {
      scale: 2, // High resolution
      backgroundColor: '#ffffff',
      logging: false
    });
    
    const image = canvas.toDataURL('image/png', 1.0);
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = image;
    link.click();
  } catch (err) {
    console.error('Error generating image export:', err);
    alert('Failed to generate image export.');
  }
};
