// The preview and live connector share the same silhouette.
export function bridgePaths(startX, startY, endX, endY, middleX = (startX + endX) / 2, sway = 0) {
  const middleY = (startY + endY) / 2 + sway;
  const shoulder = (endX - startX) * .22;
  return {
    body: `M ${startX} ${startY-19} C ${startX} ${startY-7} ${middleX-shoulder} ${middleY-3} ${middleX} ${middleY-3} C ${middleX+shoulder} ${middleY-3} ${endX} ${endY-7} ${endX} ${endY-15} L ${endX} ${endY+15} C ${endX} ${endY+7} ${middleX+shoulder} ${middleY+3} ${middleX} ${middleY+3} C ${middleX-shoulder} ${middleY+3} ${startX} ${startY+7} ${startX} ${startY+19} Z`,
    current: `M ${startX} ${startY} C ${middleX-shoulder} ${startY} ${middleX-shoulder} ${middleY} ${middleX} ${middleY} S ${endX} ${endY} ${endX} ${endY}`
  };
}
