import json
import os
import pymiere


def register(mcp, connector):
    @mcp.tool()
    def premiere_export_xml(export_path: str) -> str:
        """
        Exports the currently active sequence to an FCP7 XML file.
        Returns JSON with success status.
        """
        try:
            app = connector.get_app()
            project = connector.get_project()
            sequence = connector.get_active_sequence()
        except Exception as e:
            return json.dumps({"error": str(e)})

        try:
            # Need to pass an absolute valid OS path
            abs_path = os.path.abspath(export_path)

            # 1 means suppress UI
            res = sequence.exportAsFinalCutProXML(abs_path, 1)

            if not res:
                 return json.dumps({"error": "Failed to compile XML from Premiere."})

            return json.dumps({
                "success": True,
                "path": abs_path,
                "message": f"Exported {sequence.name} to {abs_path}"
            })

        except Exception as e:
            return json.dumps({"error": f"Error during export: {str(e)}"})

    @mcp.tool()
    def premiere_import_xml(import_path: str) -> str:
        """
        Imports an FCP7 XML file into the Premiere Pro project as a new sequence.
        """
        try:
            app = connector.get_app()
            project = connector.get_project()
        except Exception as e:
            return json.dumps({"error": str(e)})

        try:
            abs_path = os.path.abspath(import_path)
            if not os.path.exists(abs_path):
                 return json.dumps({"error": f"File does not exist: {abs_path}"})

            file_size = os.path.getsize(abs_path)
            if file_size == 0:
                return json.dumps({"error": f"XML file is empty: {abs_path}"})

            # Count items before import to verify after
            items_before = project.rootItem.children.numItems

            # importFiles: suppressUI=False so Premiere shows errors if any
            res = project.importFiles([abs_path], False, project.rootItem, False)

            items_after = project.rootItem.children.numItems
            new_items = items_after - items_before

            if new_items <= 0:
                return json.dumps({
                    "error": f"Import appeared to succeed but no new items were added to the project. "
                             f"The XML file is at: {abs_path} -- you can try importing it manually via File > Import.",
                    "xml_path": abs_path
                })

            # Auto-open the newly imported sequence in the timeline
            opened_name = None
            try:
                import time
                time.sleep(0.5)  # Give Premiere a moment to register the import

                # Search all sequences for the one with "AutoPod Edit" in the name
                num_seq = project.sequences.numSequences
                for si in range(num_seq - 1, -1, -1):  # Search newest first
                    seq = project.sequences[si]
                    if 'AutoPod Edit' in (seq.name or ''):
                        project.activeSequence = seq
                        opened_name = seq.name
                        break

                # Fallback: just open the last (newest) sequence
                if not opened_name and num_seq > 0:
                    seq = project.sequences[num_seq - 1]
                    project.activeSequence = seq
                    opened_name = seq.name
            except Exception as e:
                opened_name = f"(auto-open failed: {e})"

            msg = f"Imported {abs_path} into project ({new_items} new item(s) added)."
            if opened_name:
                msg += f" Opened sequence: {opened_name}"

            return json.dumps({
                "success": True,
                "message": msg,
                "xml_path": abs_path
            })

        except Exception as e:
            return json.dumps({
                "error": f"Error during import: {str(e)}. XML file saved at: {abs_path}",
                "xml_path": abs_path
            })
