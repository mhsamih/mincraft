// =============================================================================
//  Classic (build & break) mode — engine loader
//  ---------------------------------------------------------------------------
//  This file is the place to drop the "Minecraft: JavaScript Edition" engine
//  (the CodePen you provided, originally by Karlee Rae — a spin-off of MineKhan
//  by Khan Academy). That engine is a large third-party work, so it is not
//  bundled here; paste it in to enable Classic mode.
//
//  HOW TO ENABLE CLASSIC MODE (one step):
//    1. Open your CodePen and copy ONLY the JavaScript (the big
//       `var MathGlob = Math ... init()` block — everything that was inside the
//       <script type="application/javascript"> tag).
//    2. Paste it BELOW the marker line near the bottom of this file.
//    3. Save. classic.html already provides the canvas, inputs and shader tags
//       the engine expects, so it will just work.
//
//  Keep the original author's credit intact (it shows on the title screen).
// =============================================================================

(function () {
  // If the engine has been pasted in below, it defines MineJS and starts itself.
  // Until then, show a friendly message on the overlay so the page isn't blank.
  function showSetupHint() {
    if (typeof window.MineJS === "function") return; // engine present — do nothing
    var canvas = document.getElementById("overlay");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    function draw() {
      ctx.fillStyle = "#6a6a6a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 34px monospace";
      ctx.fillText("Classic Build Mode", canvas.width / 2, canvas.height / 2 - 80);
      ctx.font = "18px monospace";
      var lines = [
        "To enable the exact CodePen engine, open classic.js and paste",
        "your Minecraft-JS-Edition JavaScript below the marker near the bottom.",
        "",
        "(It is a large third-party engine, so it ships empty here.)",
        "",
        "Strike Mode (the multiplayer shooter) works right now — click ← Modes.",
      ];
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], canvas.width / 2, canvas.height / 2 - 20 + i * 28);
      }
    }
    draw();
    window.addEventListener("resize", function () {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    });
  }

  // Run after the rest of this file (engine paste, if any) has executed.
  window.addEventListener("load", showSetupHint);
})();

// ============================================================================
// ⬇⬇⬇  PASTE THE CODEPEN ENGINE JAVASCRIPT BELOW THIS LINE  ⬇⬇⬇
// (everything that was inside <script type="application/javascript"> in the pen,
//  starting at `var MathGlob = Math` and ending with the final `init()` call)
// ============================================================================
