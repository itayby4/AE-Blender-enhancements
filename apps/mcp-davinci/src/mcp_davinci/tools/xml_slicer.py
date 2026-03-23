import xml.etree.ElementTree as ET
import copy
import re

def fraction_to_float(frac_str: str) -> float:
    """Convert FCPXML fractional string like '360000/24000s' or '10s' to float."""
    if not frac_str:
        return 0.0
    s = frac_str.replace('s', '')
    if '/' in s:
        num, den = s.split('/')
        return float(num) / float(den)
    return float(s)

def float_to_fraction(val: float, den: int = 24000) -> str:
    """Convert float back to FCPXML fraction string like '120000/24000s'."""
    num = int(round(val * den))
    if num % den == 0:
        return f"{num // den}s"
    return f"{num}/{den}s"

def slice_fcpxml(input_path: str, output_path: str, slice_start_sec: float, slice_duration_sec: float):
    """
    Reads an FCPXML file, removes clips completely outside the slice range,
    trims overlapping clips, and saves to output_path.
    slice_start_sec is relative to the absolute start of the sequence.
    """
    tree = ET.parse(input_path)
    root = tree.getroot()

    # Find the sequence to get its start time
    sequence = root.find('.//sequence')
    if sequence is None:
        raise ValueError("No <sequence> found in FCPXML")
        
    seq_start_str = sequence.get('tcStart', '0s')
    seq_start = fraction_to_float(seq_start_str)
    
    # FCPXML formats denominator guess
    format_ref = sequence.get('format')
    den = 24000 # default fallback
    if format_ref:
        fmt = root.find(f".//format[@id='{format_ref}']")
        if fmt is not None:
            fd = fmt.get('frameDuration')
            if fd and '/' in fd.replace('s',''):
                den = int(fd.replace('s','').split('/')[1])
                
    # We want to keep content for slice_duration_sec
    # If the LLM passed absolute seconds (already including seq_start offset)
    if slice_start_sec >= seq_start and seq_start > 0:
        abs_slice_start = slice_start_sec
    else:
        abs_slice_start = seq_start + slice_start_sec
        
    abs_slice_end = abs_slice_start + slice_duration_sec
    
    # Update sequence duration so there isn't black space at the end
    sequence.set('duration', float_to_fraction(slice_duration_sec, den))

    # FCPXML elements that represent items on the timeline
    clip_tags = {'clip', 'asset-clip', 'title', 'video', 'audio', 'mc-clip', 'ref-clip', 'gap'}
    
    def process_element(parent):
        elements_to_remove = []
        for child in parent:
            if child.tag in clip_tags:
                offset_str = child.get('offset', '0s')
                duration_str = child.get('duration', '0s')
                start_str = child.get('start', '0s')
                
                offset = fraction_to_float(offset_str)
                duration = fraction_to_float(duration_str)
                start = fraction_to_float(start_str)
                
                end = offset + duration
                
                # Check if clip is completely outside our slice
                if end <= abs_slice_start or offset >= abs_slice_end:
                    elements_to_remove.append(child)
                    continue
                    
                # Clip overlaps! We need to trim.
                new_offset = offset
                new_start = start
                new_duration = duration
                
                # Trim left side
                if offset < abs_slice_start:
                    diff = abs_slice_start - offset
                    new_offset = abs_slice_start
                    new_start += diff
                    new_duration -= diff
                
                # Trim right side
                if (new_offset + new_duration) > abs_slice_end:
                    new_duration = abs_slice_end - new_offset
                    
                # The new_offset needs to be shifted so the timeline starts at seq_start
                # Basically, we shift the whole world to the left by `slice_start_sec`
                shifted_offset = new_offset - slice_start_sec
                
                child.set('offset', float_to_fraction(shifted_offset, den))
                child.set('start', float_to_fraction(new_start, den))
                child.set('duration', float_to_fraction(new_duration, den))
                
                # Also process children recursively (for audio inside video, etc)
                process_element(child)
            else:
                # If it's a spine or a generic container, recurse down
                process_element(child)
                
        for child in elements_to_remove:
            parent.remove(child)

    # Process all spines
    for spine in root.findall('.//spine'):
        process_element(spine)
        
    tree.write(output_path, encoding='UTF-8', xml_declaration=True)
