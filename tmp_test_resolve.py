import sys
import pprint

def main():
    try:
        import DaVinciResolveScript as dvr_script
    except ImportError:
        print("DaVinciResolveScript not found in PYTHONPATH")
        return

    resolve = dvr_script.scriptapp("Resolve")
    if not resolve:
        print("Could not connect to DaVinci Resolve. Is it running?")
        return
        
    projectManager = resolve.GetProjectManager()
    project = projectManager.GetCurrentProject()
    if not project:
        print("No project open.")
        return
        
    timeline = project.GetCurrentTimeline()
    if not timeline:
        print("No timeline open.")
        return
        
    print("Timeline methods:")
    pprint.pprint([m for m in dir(timeline) if not m.startswith('_')])
    
    print("\nProject methods:")
    pprint.pprint([m for m in dir(project) if not m.startswith('_')])

if __name__ == "__main__":
    main()
