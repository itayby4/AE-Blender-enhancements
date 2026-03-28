import xml.etree.ElementTree as ET
import copy
import typing

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

def slice_fcpxml(input_path: str, output_path: str, cuts: typing.List[typing.Dict[str, float]]):
    """
    Reads an FCPXML file and constructs a new timeline assembled from multiple disjoint cuts.
    cuts: [{'start_seconds': 10.0, 'end_seconds': 20.0}, ...]
    """
    if not cuts:
        raise ValueError("No cuts provided for slicing.")

    tree = ET.parse(input_path)
    root = tree.getroot()

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
                
    old_spines = root.findall('.//spine')
    if not old_spines:
        return
        
    primary_spine = old_spines[0] 
    new_spine = ET.Element('spine')
    
    current_sequence_offset = seq_start
    clip_tags = {'clip', 'asset-clip', 'title', 'video', 'audio', 'mc-clip', 'ref-clip', 'gap'}
    
    for cut in cuts:
        start_sec = cut.get('start_seconds', 0.0)
        end_sec = cut.get('end_seconds', 0.0)
        
        if start_sec >= seq_start and seq_start > 0:
            abs_slice_start = start_sec
            abs_slice_end = end_sec
        else:
            abs_slice_start = seq_start + start_sec
            abs_slice_end = seq_start + end_sec
            
        cut_duration = abs_slice_end - abs_slice_start
        if cut_duration <= 0:
            continue
            
        shift_amount = abs_slice_start - current_sequence_offset
        spine_copy = copy.deepcopy(primary_spine)
        
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
                    
                    if end <= abs_slice_start or offset >= abs_slice_end:
                        elements_to_remove.append(child)
                        continue
                        
                    new_offset = offset
                    new_start = start
                    new_duration = duration
                    
                    if offset < abs_slice_start:
                        diff = abs_slice_start - offset
                        new_offset = abs_slice_start
                        new_start += diff
                        new_duration -= diff
                    
                    if (new_offset + new_duration) > abs_slice_end:
                        new_duration = abs_slice_end - new_offset
                        
                    shifted_offset = new_offset - shift_amount
                    
                    child.set('offset', float_to_fraction(shifted_offset, den))
                    child.set('start', float_to_fraction(new_start, den))
                    child.set('duration', float_to_fraction(new_duration, den))
                    
                    process_element(child)
                else:
                    process_element(child)
                    
            for child in elements_to_remove:
                parent.remove(child)

        process_element(spine_copy)
        
        # Append the surviving clips for this cut to the new unified spine
        for child in list(spine_copy):
            new_spine.append(child)
            
        current_sequence_offset += cut_duration
        
    sequence.remove(primary_spine)
    sequence.append(new_spine)
    
    total_duration = current_sequence_offset - seq_start
    sequence.set('duration', float_to_fraction(total_duration, den))
    
    tree.write(output_path, encoding='UTF-8', xml_declaration=True)
    
    # Fix DaVinci strict DOCTYPE requirement (xml.etree strips it)
    with open(output_path, 'r', encoding='UTF-8') as f:
        content = f.read()
    if '<!DOCTYPE' not in content:
        content = content.replace('<?xml version=\'1.0\' encoding=\'UTF-8\'?>', '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>')
        if '<?xml' not in content:
            content = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n' + content
        with open(output_path, 'w', encoding='UTF-8') as f:
            f.write(content)
