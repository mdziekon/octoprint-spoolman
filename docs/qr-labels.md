# QR spool selection

Design and print labels in Spoolman, then scan them with your phone to confirm
which spool OctoPrint should use. Both services must use the same spool inventory.
Spoolman's label designer must support **Custom URL** QR codes.

## Create a label

1. In OctoPrint's spool list, click **Print in Spoolman** beside a spool and copy
   the **Custom QR URL template**, for example:
   `http://192.168.0.81/?spoolman_spool={id}`.
2. Click **Open Spoolman printing** and choose a **Spool** label design. Select
   its QR element, set **QR code link** to **Custom URL**, and paste the template.
   Keep `{id}` unchanged: Spoolman substitutes each spool's ID. Save the design.
3. Choose the label dimensions and text fields in Spoolman. In **Print**, select
   **Label printer** for one label per page. For a single label, choose one spool
   and one copy.
4. In Chrome, choose the DYMO queue, match the loaded stock and orientation,
   use **100% scale**, and disable headers and footers. Check that preview shows
   one page with all text and the complete QR inside the label.

## Addresses

The template automatically uses OctoPrint's IP address, preserving its scheme,
port and proxy path. If the detected address is unreachable from the phone
(for example, a Docker address), set **OctoPrint URL for QR labels** to the
phone-accessible base URL. Reserve that IP in your router and test it on the
phone before printing a batch. HTTPS needs a certificate valid for the IP.

If Spoolman uses an internal address, set **Spoolman Web interface URL** to its
browser-accessible address. Update saved designs and reprint existing labels
when the OctoPrint address changes.

## Scan and confirm

Scan with the phone camera, log in to OctoPrint, check the spool and printer,
and press **Use this spool**. A sole extruder is selected automatically;
multiple extruders require an explicit choice. Opening or cancelling the link
leaves the selection unchanged.

Confirmation requires **Control** permission and rejects active or paused prints
and unavailable, archived or incomplete spools. Failed requests leave the current
selection unchanged; successful changes update other open dashboards.
