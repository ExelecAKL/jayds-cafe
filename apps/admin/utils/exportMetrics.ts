import html2canvas from "html2canvas";
import { recordsCsv } from "./exportData";
import { notifyAdmin } from "../components/AdminToasts";

export const exportAsCsv = (
  data: Record<string, unknown>[],
  filename: string,
) => {
  if (!data || data.length === 0) {
    notifyAdmin("No data available to export.", "error");
    return;
  }

  const csvString = recordsCsv(data);

  // Create download link
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  notifyAdmin("CSV export downloaded.", "success");
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
      backgroundColor: "#ffffff",
      logging: false,
    });

    const image = canvas.toDataURL("image/png", 1.0);
    const link = document.createElement("a");
    link.download = `${filename}.png`;
    link.href = image;
    link.click();
    notifyAdmin("PNG export downloaded.", "success");
  } catch (err) {
    console.error("Error generating image export:", err);
    notifyAdmin("Failed to generate image export. Please retry.", "error");
  }
};
